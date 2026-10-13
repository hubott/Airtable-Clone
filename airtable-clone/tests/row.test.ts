import assert from "node:assert/strict";
import { test } from "node:test";
import type { PrismaClient } from "../generated/prisma/index.js";
import { prependCachedRow, removeCachedRow } from "../src/utils/row-cache";
import type { Rows } from "../src/utils/cell-cache";

process.env.SKIP_ENV_VALIDATION = "1";
Object.assign(process.env, { NODE_ENV: "test" });
const { appRouter } = await import("../src/server/api/root");

function setup(
  options: {
    owned?: boolean;
    authenticated?: boolean;
    firstOrder?: number | null;
    failDelete?: boolean;
  } = {},
) {
  const events: string[] = [];
  let queryArguments: unknown;
  const database = {
    $queryRaw: async (
      _sql: TemplateStringsArray,
      id: string,
      ownerId: string,
    ) => {
      assert.equal(ownerId, "owner");
      events.push("lock");
      return options.owned === false ? [] : [{ id }];
    },
    table: {
      findFirst: async () => (options.owned === false ? null : { id: "table" }),
    },
    row: {
      findFirst: async () => {
        events.push("find-first");
        return options.firstOrder === null
          ? null
          : { order: options.firstOrder ?? 10 };
      },
      create: async (args: { data: { tableId: string; order: number } }) => {
        events.push("create");
        return { id: "new", ...args.data };
      },
      delete: async () => {
        events.push("delete-row");
        if (options.failDelete) throw new Error("delete failed");
        return { id: "row" };
      },
      findMany: async (args: unknown) => {
        queryArguments = args;
        return [{ id: "next", tableId: "table", order: 12, cells: [] }];
      },
    },
    cell: {
      deleteMany: async (args: { where: { rowId: string } }) => {
        assert.equal(args.where.rowId, "row");
        events.push("delete-cells");
        return { count: 2 };
      },
    },
    $transaction: async <T>(callback: (tx: unknown) => Promise<T>) => {
      events.push("begin");
      try {
        const result = await callback(database);
        events.push("commit");
        return result;
      } catch (error) {
        events.push("rollback");
        throw error;
      }
    },
  };
  const caller = appRouter.createCaller({
    db: database as unknown as PrismaClient,
    headers: new Headers(),
    session:
      options.authenticated === false
        ? null
        : { user: { id: "owner" }, expires: "2099-01-01" },
  });
  return { caller, events, getQueryArguments: () => queryArguments };
}

void test("row mutations reject unauthenticated callers before database access", async () => {
  const { caller, events } = setup({ authenticated: false });
  await assert.rejects(caller.row.createRow({ tableId: "table" }), {
    code: "UNAUTHORIZED",
  });
  await assert.rejects(caller.row.deleteRow({ rowId: "row" }), {
    code: "UNAUTHORIZED",
  });
  assert.deepEqual(events, []);
});

void test("row mutations reject missing or unowned resources without writing", async () => {
  const { caller, events } = setup({ owned: false });
  await assert.rejects(caller.row.createRow({ tableId: "table" }), {
    code: "NOT_FOUND",
  });
  await assert.rejects(caller.row.deleteRow({ rowId: "row" }), {
    code: "NOT_FOUND",
  });
  assert.equal(events.includes("create"), false);
  assert.equal(events.includes("delete-cells"), false);
});

void test("inserts before the first row after taking the table lock", async () => {
  const { caller, events } = setup({ firstOrder: -5 });
  assert.deepEqual(await caller.row.createRow({ tableId: "table" }), {
    id: "new",
    tableId: "table",
    order: -6,
    cellsByColumnId: {},
  });
  assert.deepEqual(events, ["begin", "lock", "find-first", "create", "commit"]);
});

void test("starts empty tables at zero and rejects integer underflow", async () => {
  const empty = setup({ firstOrder: null });
  assert.equal(
    (await empty.caller.row.createRow({ tableId: "table" })).order,
    0,
  );
  const full = setup({ firstOrder: -2147483648 });
  await assert.rejects(full.caller.row.createRow({ tableId: "table" }), {
    code: "CONFLICT",
  });
  assert.equal(full.events.includes("create"), false);
});

void test("deletes dependent cells and the row in one transaction", async () => {
  const { caller, events } = setup();
  assert.deepEqual(await caller.row.deleteRow({ rowId: "row" }), { id: "row" });
  assert.deepEqual(events, [
    "begin",
    "lock",
    "delete-cells",
    "delete-row",
    "commit",
  ]);
});

void test("deletion failure propagates and rolls back the transaction", async () => {
  const { caller, events } = setup({ failDelete: true });
  await assert.rejects(caller.row.deleteRow({ rowId: "row" }), /delete failed/);
  assert.equal(events.at(-1), "rollback");
  assert.equal(events.includes("commit"), false);
});

void test("pagination uses the order/id boundary without requiring the cursor row to exist", async () => {
  const { caller, getQueryArguments } = setup();
  const result = await caller.row.getRows({
    tableId: "table",
    take: 1,
    cursor: { id: "deleted", order: 10 },
  });
  assert.deepEqual(result.nextCursor, { id: "next", order: 12 });
  assert.deepEqual(getQueryArguments(), {
    where: {
      tableId: "table",
      OR: [{ order: { gt: 10 } }, { order: 10, id: { gt: "deleted" } }],
    },
    take: 1,
    orderBy: [{ order: "asc" }, { id: "asc" }],
    include: {
      cells: {
        select: {
          rowId: true,
          columnId: true,
          textValue: true,
          numberValue: true,
        },
      },
    },
  });
});

void test("row cache updates preserve page boundaries even when their cursor row is deleted", () => {
  const oldRow = {
    id: "old",
    tableId: "table",
    order: 10,
    cellsByColumnId: {},
  };
  const nextRow = { ...oldRow, id: "next", order: 11 };
  const boundary = { id: "old", order: 10 };
  const data: Rows = {
    pages: [
      { formattedRows: [oldRow], nextCursor: boundary },
      { formattedRows: [nextRow], nextCursor: null },
    ],
    pageParams: [null, boundary],
  };
  const inserted = prependCachedRow(data, { ...oldRow, id: "new", order: 9 });
  assert.deepEqual(
    inserted?.pages[0]?.formattedRows.map((row) => row.id),
    ["new", "old"],
  );
  assert.equal(inserted?.pages[1], data.pages[1]);
  const deleted = removeCachedRow(inserted, "old");
  assert.deepEqual(
    deleted?.pages[0]?.formattedRows.map((row) => row.id),
    ["new"],
  );
  assert.equal(deleted?.pages[0]?.nextCursor, boundary);
  assert.equal(deleted?.pageParams, data.pageParams);
  assert.equal(deleted?.pages[1], data.pages[1]);
});
