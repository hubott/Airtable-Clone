import assert from "node:assert/strict";
import { test } from "node:test";
import type { PrismaClient } from "../generated/prisma/index.js";
import { createTransactionMock } from "./helpers/transaction";

process.env.SKIP_ENV_VALIDATION = "1";
Object.assign(process.env, { NODE_ENV: "test" });
const { appRouter } = await import("../src/server/api/root");

function setup(
  options: { authenticated?: boolean; owned?: boolean; column?: boolean } = {},
) {
  const events: string[] = [];
  const db = {
    table: {
      findFirst: async (args: { where: { base: { ownerId: string } } }) => {
        assert.equal(args.where.base.ownerId, "owner");
        events.push("table");
        return options.owned === false ? null : { id: "table" };
      },
    },
    column: {
      findFirst: async (args: {
        where: {
          id: string;
          tableId: string;
          table: { base: { ownerId: string } };
        };
      }) => {
        assert.deepEqual(args.where, {
          id: "column",
          tableId: "table",
          table: { base: { ownerId: "owner" } },
        });
        events.push("column");
        return options.column === false ? null : { type: "NUMBER" };
      },
    },
    $queryRaw: async () => {
      events.push("sort");
      return [
        { id: "second", order: 2, value: 0 },
        { id: "first", order: 1, value: 10 },
      ];
    },
    row: {
      findMany: async (args: {
        where: { tableId: string; id: { in: string[] } };
      }) => {
        assert.deepEqual(args.where, {
          tableId: "table",
          id: { in: ["second", "first"] },
        });
        return [
          { id: "first", order: 1, tableId: "table", cells: [] },
          { id: "second", order: 2, tableId: "table", cells: [] },
        ];
      },
    },
    $transaction: createTransactionMock((): unknown => db, events),
  };
  return {
    events,
    caller: appRouter.createCaller({
      db: db as unknown as PrismaClient,
      headers: new Headers(),
      session:
        options.authenticated === false
          ? null
          : { user: { id: "owner" }, expires: "2099-01-01" },
    }),
  };
}
const input = {
  tableId: "table",
  take: 2,
  sort: { columnId: "column", direction: "asc" as const },
};
void test("sorted reads reject anonymous, unowned and cross-table columns before querying rows", async () => {
  for (const [options, code] of [
    [{ authenticated: false }, "UNAUTHORIZED"],
    [{ owned: false }, "NOT_FOUND"],
    [{ column: false }, "NOT_FOUND"],
  ] as const) {
    const { caller, events } = setup(options);
    await assert.rejects(caller.row.getRows(input), { code });
    assert.equal(events.includes("sort"), false);
  }
});
void test("sorted hydration preserves SQL order and returns a value-based cursor", async () => {
  const { caller, events } = setup();
  const result = await caller.row.getRows(input);
  assert.deepEqual(
    result.formattedRows.map((row) => row.id),
    ["second", "first"],
  );
  assert.deepEqual(result.nextCursor, {
    id: "first",
    order: 1,
    sort: { ...input.sort, type: "NUMBER", value: 10 },
  });
  assert.equal(events.at(-1), "commit");
});
void test("sorted reads reject mismatched cursor context and values before SQL execution", async () => {
  const contexts = [
    undefined,
    { ...input.sort, type: "TEXT" as const, value: "10" },
    { ...input.sort, type: "NUMBER" as const, value: "10" },
    { ...input.sort, columnId: "other", type: "NUMBER" as const, value: 10 },
    {
      ...input.sort,
      direction: "desc" as const,
      type: "NUMBER" as const,
      value: 10,
    },
  ];
  for (const sort of contexts) {
    const { caller, events } = setup();
    await assert.rejects(
      caller.row.getRows({
        ...input,
        cursor: { id: "deleted", order: 0, sort },
      }),
      { code: "BAD_REQUEST" },
    );
    assert.equal(events.includes("sort"), false);
  }
  const { caller } = setup();
  await assert.rejects(
    caller.row.getRows({
      tableId: "table",
      cursor: {
        id: "x",
        order: 0,
        sort: { ...input.sort, type: "NUMBER", value: 0 },
      },
    }),
    { code: "BAD_REQUEST" },
  );
});

const filter = {
  columnId: "column",
  type: "NUMBER" as const,
  operator: "gte" as const,
  value: 0,
};
void test("filtered reads authorize the table and filter column even without sorting", async () => {
  for (const [options, code] of [
    [{ authenticated: false }, "UNAUTHORIZED"],
    [{ owned: false }, "NOT_FOUND"],
    [{ column: false }, "NOT_FOUND"],
  ] as const) {
    const { caller, events } = setup(options);
    await assert.rejects(caller.row.getRows({ tableId: "table", filter }), {
      code,
    });
    assert.equal(events.includes("sort"), false);
  }
  const { caller } = setup();
  const result = await caller.row.getRows({
    tableId: "table",
    take: 2,
    filter,
  });
  assert.deepEqual(result.nextCursor, { id: "first", order: 1, filter });
});
void test("filtered reads reject changed filters, stale types and invalid operators before executing SQL", async () => {
  const attempts = [
    { tableId: "table", filter, cursor: { id: "deleted", order: 0 } },
    {
      tableId: "table",
      filter,
      cursor: { id: "deleted", order: 0, filter: { ...filter, value: 1 } },
    },
    { tableId: "table", cursor: { id: "deleted", order: 0, filter } },
  ];
  for (const attempt of attempts) {
    const { caller, events } = setup();
    await assert.rejects(caller.row.getRows(attempt), { code: "BAD_REQUEST" });
    assert.equal(events.includes("sort"), false);
  }
  const { caller, events } = setup();
  await assert.rejects(
    caller.row.getRows({
      tableId: "table",
      filter: {
        columnId: "column",
        type: "TEXT",
        operator: "equals",
        value: "0",
      },
    }),
    { code: "CONFLICT" },
  );
  assert.equal(events.includes("sort"), false);
});

void test("search-only reads require authentication and table ownership", async () => {
  for (const options of [{ authenticated: false }, { owned: false }]) {
    const { caller, events } = setup(options);
    await assert.rejects(
      caller.row.getRows({ tableId: "table", search: "Alpha" }),
      { code: options.authenticated === false ? "UNAUTHORIZED" : "NOT_FOUND" },
    );
    assert.equal(events.includes("sort"), false);
  }
  const { caller } = setup();
  const result = await caller.row.getRows({
    tableId: "table",
    take: 2,
    search: "  Alpha  ",
  });
  assert.deepEqual(result.nextCursor, {
    id: "first",
    order: 1,
    search: "Alpha",
  });
});
void test("search changes reject stale cursors and oversized terms before SQL execution", async () => {
  for (const attempt of [
    { tableId: "table", search: "Alpha", cursor: { id: "deleted", order: 0 } },
    {
      tableId: "table",
      search: "Alpha",
      cursor: { id: "deleted", order: 0, search: "Beta" },
    },
    { tableId: "table", cursor: { id: "deleted", order: 0, search: "Alpha" } },
    { tableId: "table", search: "x".repeat(201) },
  ]) {
    const { caller, events } = setup();
    await assert.rejects(caller.row.getRows(attempt), { code: "BAD_REQUEST" });
    assert.equal(events.includes("sort"), false);
  }
});
