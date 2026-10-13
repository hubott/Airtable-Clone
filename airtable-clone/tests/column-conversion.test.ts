import assert from "node:assert/strict";
import { test } from "node:test";
import { createTransactionMock } from "./helpers/transaction";
import type { PrismaClient } from "../generated/prisma/index.js";
import { convertColumnValue } from "../src/utils/column-conversion";
process.env.SKIP_ENV_VALIDATION = "1";
Object.assign(process.env, { NODE_ENV: "test" });
const { appRouter } = await import("../src/server/api/root");

void test("conversion validates numbers, preserves zero and blanks, and clears the inactive field", () => {
  assert.deepEqual(
    convertColumnValue("TEXT", "NUMBER", {
      textValue: " 1.5e2 ",
      numberValue: null,
    }),
    { textValue: null, numberValue: 150 },
  );
  assert.deepEqual(
    convertColumnValue("TEXT", "NUMBER", { textValue: " ", numberValue: null }),
    { textValue: null, numberValue: null },
  );
  assert.deepEqual(
    convertColumnValue("NUMBER", "TEXT", { textValue: null, numberValue: 0 }),
    { textValue: "0", numberValue: null },
  );
  assert.deepEqual(
    convertColumnValue("NUMBER", "TEXT", {
      textValue: null,
      numberValue: null,
    }),
    { textValue: null, numberValue: null },
  );
  for (const value of ["hello", "Infinity", "1e999", "0x10"])
    assert.throws(() =>
      convertColumnValue("TEXT", "NUMBER", {
        textValue: value,
        numberValue: null,
      }),
    );
});
function setup(
  options: {
    owned?: boolean;
    authenticated?: boolean;
    value?: string;
    type?: "TEXT" | "NUMBER";
    lateInvalid?: boolean;
  } = {},
) {
  const events: string[] = [];
  const column = {
    id: "column",
    name: "Amount",
    tableId: "table",
    order: 0,
    type: options.type ?? "TEXT",
  };
  let batch = 0;
  const db = {
    column: {
      findFirst: async (args: {
        where: { table: { base: { ownerId: string } } };
      }) => {
        assert.equal(args.where.table.base.ownerId, "owner");
        return options.owned === false ? null : column;
      },
      update: async (args: { data: { type: string } }) => {
        events.push("type");
        return { ...column, ...args.data };
      },
    },
    cell: {
      findMany: async () =>
        options.lateInvalid && batch++ === 0
          ? Array.from({ length: 1000 }, (_, index) => ({
              id: String(index).padStart(4, "0"),
              rowId: "row",
              textValue: "12",
              numberValue: null,
            }))
          : [
              {
                id: "cell",
                rowId: "row",
                textValue: options.value ?? "123",
                numberValue: null,
              },
            ],
    },
    $queryRaw: async (sql: TemplateStringsArray, id: string, owner: string) => {
      assert.equal(id, "column");
      assert.equal(owner, "owner");
      assert.match(sql.join("?"), /FOR UPDATE OF c/);
      events.push("lock");
      return options.owned === false ? [] : [column];
    },
    $executeRaw: async () => {
      events.push("values");
      return 1;
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
const input = {
  columnId: "column",
  fromType: "TEXT" as const,
  type: "NUMBER" as const,
};
void test("preview reports invalid examples without writing; apply refuses invalid values", async () => {
  const { caller, events } = setup({ value: "not a number" });
  const preview = await caller.column.previewTypeChange(input);
  assert.equal(preview.invalidCount, 1);
  assert.equal(preview.canConvert, false);
  assert.equal(preview.samples[0]?.value, "not a number");
  assert.equal(events.length, 0);
  await assert.rejects(caller.column.changeType(input), {
    code: "BAD_REQUEST",
  });
  assert.equal(events.includes("values"), false);
  assert.equal(events.includes("type"), false);
  assert.equal(events.at(-1), "rollback");
});
void test("valid conversion locks the column and updates values before metadata", async () => {
  const { caller, events } = setup();
  assert.equal((await caller.column.changeType(input)).type, "NUMBER");
  assert.deepEqual(events, ["lock", "values", "type", "commit"]);
});
void test("unauthenticated and unowned conversions are rejected", async () => {
  for (const options of [{ authenticated: false }, { owned: false }]) {
    const { caller, events } = setup(options);
    const code = options.authenticated === false ? "UNAUTHORIZED" : "NOT_FOUND";
    await assert.rejects(caller.column.previewTypeChange(input), { code });
    await assert.rejects(caller.column.changeType(input), { code });
    assert.equal(events.includes("values"), false);
  }
});
void test("a stale source type is rejected before converting values", async () => {
  const { caller, events } = setup({ type: "NUMBER" });
  await assert.rejects(caller.column.changeType(input), { code: "CONFLICT" });
  assert.equal(events.includes("values"), false);
});

void test("invalid values found in later batches roll back earlier conversion writes", async () => {
  const { caller, events } = setup({ lateInvalid: true, value: "invalid" });
  await assert.rejects(caller.column.changeType(input), {
    code: "BAD_REQUEST",
  });
  assert.equal(events.includes("values"), true);
  assert.equal(events.includes("type"), false);
  assert.equal(events.at(-1), "rollback");
  assert.equal(events.includes("commit"), false);
});
