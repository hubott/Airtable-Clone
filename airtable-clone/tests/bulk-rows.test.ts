import assert from "node:assert/strict";
import { test } from "node:test";
import type { PrismaClient } from "../generated/prisma/index.js";
import { prependCachedRows } from "../src/utils/row-cache";
process.env.SKIP_ENV_VALIDATION = "1";
Object.assign(process.env, { NODE_ENV: "test" });
const { appRouter } = await import("../src/server/api/root");
function setup(
  options: {
    owned?: boolean;
    authenticated?: boolean;
    firstOrder?: number | null;
  } = {},
) {
  let writes = 0;
  const db = {
    $queryRaw: async (
      _sql: TemplateStringsArray,
      id: string,
      owner: string,
    ) => {
      assert.equal(id, "table");
      assert.equal(owner, "owner");
      return options.owned === false ? [] : [{ id }];
    },
    row: {
      findFirst: async () =>
        options.firstOrder === null
          ? null
          : { order: options.firstOrder ?? 10 },
      createManyAndReturn: async (args: {
        data: { tableId: string; order: number }[];
      }) => {
        writes++;
        return args.data
          .map((row, index) => ({ id: `new-${index}`, ...row }))
          .reverse();
      },
    },
    $transaction: async <T>(callback: (tx: unknown) => Promise<T>) =>
      callback(db),
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
    getWrites: () => writes,
  };
}
void test("bulk creation reserves a contiguous order range and sorts returned rows", async () => {
  const { caller, getWrites } = setup();
  const rows = await caller.row.createRows({ tableId: "table", count: 3 });
  assert.deepEqual(
    rows.map((row) => row.order),
    [7, 8, 9],
  );
  assert.equal(getWrites(), 1);
  assert.deepEqual(rows[0]?.cellsByColumnId, {});
  const data = {
    pages: [{ formattedRows: [], nextCursor: null }],
    pageParams: [null],
  };
  assert.deepEqual(
    prependCachedRows(data, rows)?.pages[0]?.formattedRows,
    rows,
  );
});
void test("bulk creation starts empty tables at zero and prevents order underflow", async () => {
  const empty = setup({ firstOrder: null });
  assert.deepEqual(
    (await empty.caller.row.createRows({ tableId: "table", count: 2 })).map(
      (row) => row.order,
    ),
    [0, 1],
  );
  const full = setup({ firstOrder: -2147483647 });
  await assert.rejects(
    full.caller.row.createRows({ tableId: "table", count: 2 }),
    { code: "CONFLICT" },
  );
  assert.equal(full.getWrites(), 0);
});
void test("bulk creation rejects unauthorized callers and invalid counts", async () => {
  for (const options of [{ authenticated: false }, { owned: false }]) {
    const { caller, getWrites } = setup(options);
    await assert.rejects(
      caller.row.createRows({ tableId: "table", count: 3 }),
      { code: options.authenticated === false ? "UNAUTHORIZED" : "NOT_FOUND" },
    );
    assert.equal(getWrites(), 0);
  }
  const { caller, getWrites } = setup();
  for (const count of [0, -1, 1.5, 1001])
    await assert.rejects(caller.row.createRows({ tableId: "table", count }), {
      code: "BAD_REQUEST",
    });
  assert.equal(getWrites(), 0);
});
