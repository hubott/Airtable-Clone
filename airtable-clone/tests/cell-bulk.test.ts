import assert from "node:assert/strict";
import { test } from "node:test";
import type { PrismaClient } from "../generated/prisma/index.js";
import { createTransactionMock } from "./helpers/transaction";

process.env.SKIP_ENV_VALIDATION = "1";
Object.assign(process.env, { NODE_ENV: "test" });
const { appRouter } = await import("../src/server/api/root");

type Saved = {
  rowId: string;
  columnId: string;
  textValue: string | null;
  numberValue: number | null;
};
function setup(
  options: {
    authenticated?: boolean;
    owned?: boolean;
    missingRow?: boolean;
    missingColumn?: boolean;
    failWrite?: boolean;
  } = {},
) {
  const writes: Saved[] = [];
  const events: string[] = [];
  let queries = 0;
  const database = {
    $queryRaw: async (sql: unknown, ...args: unknown[]) => {
      queries++;
      if (queries === 1) {
        assert.equal(args[0], "table");
        assert.equal(args[1], "owner");
        return options.owned === false ? [] : [{ id: "table" }];
      }
      const query = sql as { sql: string; values: unknown[] };
      assert.equal(query.values[0], "table");
      assert.match(query.sql, /ORDER BY "id" FOR/);
      if (queries === 2)
        return options.missingColumn
          ? []
          : [
              { id: "text", type: "TEXT" },
              { id: "number", type: "NUMBER" },
            ];
      return options.missingRow ? [] : [{ id: "row" }];
    },
    cell: {
      upsert: async ({
        create,
        update,
      }: {
        create: Saved;
        update: { textValue: string | null; numberValue: number | null };
      }) => {
        assert.equal(create.textValue, update.textValue);
        assert.equal(create.numberValue, update.numberValue);
        if (options.failWrite && writes.length) throw new Error("write failed");
        writes.push(create);
        return create;
      },
    },
    $transaction: createTransactionMock((): unknown => database, events),
  };
  const caller = appRouter.createCaller({
    db: database as unknown as PrismaClient,
    headers: new Headers(),
    session:
      options.authenticated === false
        ? null
        : { user: { id: "owner" }, expires: "2099-01-01" },
  });
  return { caller, writes, events };
}
const textCell = { rowId: "row", columnId: "text", value: "  kept  " };
const numberCell = { rowId: "row", columnId: "number", value: "1.25" };
const input = { tableId: "table", cells: [textCell, numberCell] };

void test("bulk paste authorizes the table and validates every row/column before writing", async () => {
  for (const [options, code] of [
    [{ authenticated: false }, "UNAUTHORIZED"],
    [{ owned: false }, "NOT_FOUND"],
    [{ missingRow: true }, "NOT_FOUND"],
    [{ missingColumn: true }, "NOT_FOUND"],
  ] as const) {
    const { caller, writes } = setup(options);
    await assert.rejects(caller.cell.updateCells(input), { code });
    assert.equal(writes.length, 0);
  }
});
void test("invalid numbers and duplicate destinations cause zero writes", async () => {
  for (const cells of [
    [textCell, { ...numberCell, value: "NaN" }],
    [textCell, textCell],
  ]) {
    const { caller, writes } = setup();
    await assert.rejects(caller.cell.updateCells({ tableId: "table", cells }), {
      code: "BAD_REQUEST",
    });
    assert.equal(writes.length, 0);
  }
});
void test("bulk paste preserves text and clears inactive numeric/text fields", async () => {
  const { caller, events } = setup();
  assert.deepEqual(await caller.cell.updateCells(input), [
    {
      rowId: "row",
      columnId: "text",
      textValue: "  kept  ",
      numberValue: null,
    },
    { rowId: "row", columnId: "number", textValue: null, numberValue: 1.25 },
  ]);
  assert.deepEqual(events, ["commit"]);
});
void test("bulk write failures reject the entire transaction", async () => {
  const { caller, events } = setup({ failWrite: true });
  await assert.rejects(caller.cell.updateCells(input), /write failed/);
  assert.deepEqual(events, ["rollback"]);
});

void test("bulk paste rejects empty and oversized requests and clears blank values", async () => {
  const { caller, writes } = setup();
  await assert.rejects(
    caller.cell.updateCells({ tableId: "table", cells: [] }),
    { code: "BAD_REQUEST" },
  );
  await assert.rejects(
    caller.cell.updateCells({
      tableId: "table",
      cells: Array.from({ length: 1001 }, () => textCell),
    }),
    { code: "BAD_REQUEST" },
  );
  assert.equal(writes.length, 0);
  const saved = await caller.cell.updateCells({
    tableId: "table",
    cells: [
      { ...textCell, value: "" },
      { ...numberCell, value: "  " },
    ],
  });
  assert.ok(
    saved.every((cell) => cell.textValue === null && cell.numberValue === null),
  );
});
