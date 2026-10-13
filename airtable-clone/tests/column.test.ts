import assert from "node:assert/strict";
import { test } from "node:test";
import type { PrismaClient } from "../generated/prisma/index.js";

process.env.SKIP_ENV_VALIDATION = "1";
Object.assign(process.env, { NODE_ENV: "test" });
const { appRouter } = await import("../src/server/api/root");

function setup(
  options: {
    authenticated?: boolean;
    owned?: boolean;
    lastOrder?: number | null;
  } = {},
) {
  const events: string[] = [];
  const database = {
    $queryRaw: async (
      sql: TemplateStringsArray,
      tableId: string,
      ownerId: string,
    ) => {
      assert.equal(tableId, "table");
      assert.equal(ownerId, "owner");
      assert.match(sql.join("?"), /FOR UPDATE OF t/);
      events.push("lock");
      return options.owned === false ? [] : [{ id: tableId }];
    },
    column: {
      findFirst: async () => {
        events.push("find-last");
        return options.lastOrder === null
          ? null
          : { order: options.lastOrder ?? 3 };
      },
      create: async (args: {
        data: {
          tableId: string;
          name: string;
          type: "TEXT" | "NUMBER";
          order: number;
        };
      }) => {
        events.push("create");
        return { id: "new-column", ...args.data };
      },
    },
    $transaction: async <T>(callback: (tx: unknown) => Promise<T>) => {
      events.push("begin");
      const result = await callback(database);
      events.push("commit");
      return result;
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
  return { caller, events };
}
const input = { tableId: "table", name: "Notes", type: "TEXT" as const };

void test("requires authentication and ownership before creating a column", async () => {
  const anonymous = setup({ authenticated: false });
  await assert.rejects(anonymous.caller.column.createColumn(input), {
    code: "UNAUTHORIZED",
  });
  assert.deepEqual(anonymous.events, []);
  const unowned = setup({ owned: false });
  await assert.rejects(unowned.caller.column.createColumn(input), {
    code: "NOT_FOUND",
  });
  assert.equal(unowned.events.includes("create"), false);
});
void test("trims names and appends TEXT and NUMBER columns under the table lock", async () => {
  for (const type of ["TEXT", "NUMBER"] as const) {
    const { caller, events } = setup();
    assert.deepEqual(
      await caller.column.createColumn({ ...input, name: "  Notes  ", type }),
      { id: "new-column", tableId: "table", name: "Notes", type, order: 4 },
    );
    assert.deepEqual(events, [
      "begin",
      "lock",
      "find-last",
      "create",
      "commit",
    ]);
  }
});
void test("empty tables start at zero and integer overflow is rejected", async () => {
  const empty = setup({ lastOrder: null });
  assert.equal((await empty.caller.column.createColumn(input)).order, 0);
  const full = setup({ lastOrder: 2147483647 });
  await assert.rejects(full.caller.column.createColumn(input), {
    code: "CONFLICT",
  });
  assert.equal(full.events.includes("create"), false);
});
void test("rejects empty and oversized names before database access", async () => {
  const { caller, events } = setup();
  for (const name of ["", "  ", "a".repeat(101)])
    await assert.rejects(caller.column.createColumn({ ...input, name }), {
      code: "BAD_REQUEST",
    });
  assert.deepEqual(events, []);
});

function renameSetup(
  options: { owned?: boolean; authenticated?: boolean } = {},
) {
  let writes = 0;
  const database = {
    column: {
      updateManyAndReturn: async (args: {
        where: { id: string; table: { base: { ownerId: string } } };
        data: { name: string };
      }) => {
        assert.equal(args.where.id, "column");
        assert.equal(args.where.table.base.ownerId, "owner");
        if (options.owned === false) return [];
        writes++;
        return [
          {
            id: "column",
            tableId: "table",
            type: "NUMBER",
            order: 3,
            name: args.data.name,
          },
        ];
      },
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
  return { caller, getWrites: () => writes };
}
void test("rename requires authentication and scopes the write to the owner", async () => {
  const anonymous = renameSetup({ authenticated: false });
  await assert.rejects(
    anonymous.caller.column.renameColumn({
      columnId: "column",
      name: "New name",
    }),
    { code: "UNAUTHORIZED" },
  );
  assert.equal(anonymous.getWrites(), 0);
  const unowned = renameSetup({ owned: false });
  await assert.rejects(
    unowned.caller.column.renameColumn({
      columnId: "column",
      name: "New name",
    }),
    { code: "NOT_FOUND" },
  );
  assert.equal(unowned.getWrites(), 0);
});
void test("rename trims names while preserving column identity, type and order", async () => {
  const { caller, getWrites } = renameSetup();
  assert.deepEqual(
    await caller.column.renameColumn({
      columnId: "column",
      name: "  Estimated hours  ",
    }),
    {
      id: "column",
      tableId: "table",
      type: "NUMBER",
      order: 3,
      name: "Estimated hours",
    },
  );
  assert.equal(getWrites(), 1);
});
void test("rename rejects invalid names before attempting a database update", async () => {
  const { caller, getWrites } = renameSetup();
  for (const name of ["", "  ", "a".repeat(101)])
    await assert.rejects(
      caller.column.renameColumn({ columnId: "column", name }),
      { code: "BAD_REQUEST" },
    );
  assert.equal(getWrites(), 0);
});
