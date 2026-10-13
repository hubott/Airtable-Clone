import assert from "node:assert/strict";
import { test } from "node:test";
import { createTransactionMock } from "./helpers/transaction";
import type { PrismaClient } from "../generated/prisma/index.js";
import { moveColumn } from "../src/utils/column-order";
process.env.SKIP_ENV_VALIDATION = "1";
Object.assign(process.env, { NODE_ENV: "test" });
const { appRouter } = await import("../src/server/api/root");
const columns = [
  { id: "a", name: "A", type: "TEXT" as const, tableId: "table", order: 0 },
  { id: "b", name: "B", type: "NUMBER" as const, tableId: "table", order: 4 },
  { id: "c", name: "C", type: "TEXT" as const, tableId: "table", order: 4 },
];
void test("moving columns swaps neighbors and normalizes gaps and duplicate orders", () => {
  const result = moveColumn(columns, "c", "left");
  assert.deepEqual(
    result.map((column) => [column.id, column.order]),
    [
      ["a", 0],
      ["c", 1],
      ["b", 2],
    ],
  );
  assert.equal(result[2]?.type, "NUMBER");
  assert.deepEqual(
    columns.map((column) => column.order),
    [0, 4, 4],
  );
  assert.deepEqual(
    moveColumn(columns, "a", "right").map((column) => column.id),
    ["b", "a", "c"],
  );
});
void test("boundary and missing-column moves preserve the existing list", () => {
  assert.equal(moveColumn(columns, "a", "left"), columns);
  assert.equal(moveColumn(columns, "c", "right"), columns);
  assert.equal(moveColumn(columns, "missing", "right"), columns);
  assert.deepEqual(moveColumn([], "a", "left"), []);
});
function setup(
  options: { owned?: boolean; authenticated?: boolean; fail?: boolean } = {},
) {
  const events: string[] = [];
  const db = {
    $queryRaw: async (sql: TemplateStringsArray, ...values: string[]) => {
      events.push("lock");
      if (values.length === 2) {
        assert.equal(values[1], "owner");
        return options.owned === false ? [] : [{ id: "table" }];
      }
      assert.match(sql.join("?"), /FOR UPDATE/);
      return columns;
    },
    column: {
      findMany: async () => columns,
      update: async (args: { data: { order: number } }) => {
        events.push("update");
        if (options.fail) throw new Error("update failed");
        return args;
      },
    },
    $transaction: createTransactionMock((): unknown => db, events),
  };
  return {
    caller: appRouter.createCaller({
      db: db as unknown as PrismaClient,
      headers: new Headers(),
      session:
        options.authenticated === false
          ? null
          : { user: { id: "owner" }, expires: "2099-01-01" },
    }),
    events,
  };
}
const input = { tableId: "table", columnId: "b", direction: "left" as const };
void test("reordering requires authentication, ownership and column membership", async () => {
  for (const options of [{ authenticated: false }, { owned: false }]) {
    const { caller, events } = setup(options);
    await assert.rejects(caller.column.moveColumn(input), {
      code: options.authenticated === false ? "UNAUTHORIZED" : "NOT_FOUND",
    });
    assert.equal(events.includes("update"), false);
  }
  const { caller, events } = setup();
  await assert.rejects(
    caller.column.moveColumn({ ...input, columnId: "another-table-column" }),
    { code: "NOT_FOUND" },
  );
  assert.equal(events.includes("update"), false);
});
void test("reordering commits after locked updates and rolls back on failure", async () => {
  const success = setup();
  assert.deepEqual(
    (await success.caller.column.moveColumn(input)).map((column) => column.id),
    ["b", "a", "c"],
  );
  assert.deepEqual(success.events.slice(0, 2), ["lock", "lock"]);
  assert.equal(success.events.at(-1), "commit");
  const failure = setup({ fail: true });
  await assert.rejects(
    failure.caller.column.moveColumn(input),
    /update failed/,
  );
  assert.equal(failure.events.at(-1), "rollback");
  assert.equal(failure.events.includes("commit"), false);
});
