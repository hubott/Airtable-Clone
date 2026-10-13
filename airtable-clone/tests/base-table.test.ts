import assert from "node:assert/strict";
import { test } from "node:test";
import type { PrismaClient } from "../generated/prisma/index.js";
process.env.SKIP_ENV_VALIDATION = "1";
Object.assign(process.env, { NODE_ENV: "test" });
const { appRouter } = await import("../src/server/api/root");

function setup(options: { authenticated?: boolean; owned?: boolean } = {}) {
  const events: string[] = [];
  const db = {
    base: {
      create: async (args: {
        data: { name: string; user: { connect: { id: string } } };
      }) => {
        assert.equal(args.data.user.connect.id, "owner");
        events.push("base");
        return { id: "base", name: args.data.name };
      },
      findFirst: async (args: { where: { ownerId: string } }) => {
        assert.equal(args.where.ownerId, "owner");
        return options.owned === false
          ? null
          : { id: "base", name: "Workspace" };
      },
    },
    table: {
      create: async (args: {
        data: {
          baseId: string;
          name: string;
          columns: { create: { name: string; type: string; order: number } };
          rows: { create: { order: number } };
        };
      }) => {
        assert.deepEqual(args.data.columns.create, {
          name: "Name",
          type: "TEXT",
          order: 0,
        });
        assert.deepEqual(args.data.rows.create, { order: 0 });
        events.push("table");
        return { id: "table", name: args.data.name, baseId: args.data.baseId };
      },
    },
    $queryRaw: async (sql: TemplateStringsArray, id: string, owner: string) => {
      assert.equal(id, "base");
      assert.equal(owner, "owner");
      assert.match(sql.join("?"), /FOR UPDATE/);
      events.push("lock");
      return options.owned === false ? [] : [{ id }];
    },
    $transaction: async <T>(callback: (tx: unknown) => Promise<T>) => {
      const result = await callback(db);
      events.push("commit");
      return result;
    },
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
void test("base creation trims names and assigns the authenticated owner", async () => {
  const { caller, events } = setup();
  assert.deepEqual(await caller.base.createBase({ name: "  Workspace  " }), {
    id: "base",
    name: "Workspace",
  });
  assert.deepEqual(events, ["base"]);
});
void test("table creation locks the owned base and creates a usable initial grid atomically", async () => {
  const { caller, events } = setup();
  assert.deepEqual(
    await caller.table.createTable({ baseId: "base", name: "  Tasks  " }),
    { id: "table", baseId: "base", name: "Tasks" },
  );
  assert.deepEqual(events, ["lock", "table", "commit"]);
});
void test("anonymous callers cannot create bases or tables", async () => {
  const { caller, events } = setup({ authenticated: false });
  await assert.rejects(caller.base.createBase({ name: "Workspace" }), {
    code: "UNAUTHORIZED",
  });
  await assert.rejects(
    caller.table.createTable({ baseId: "base", name: "Tasks" }),
    { code: "UNAUTHORIZED" },
  );
  assert.deepEqual(events, []);
});
void test("unowned and missing bases cannot be viewed or used for table creation", async () => {
  const { caller, events } = setup({ owned: false });
  await assert.rejects(caller.base.getBase({ baseId: "base" }), {
    code: "NOT_FOUND",
  });
  await assert.rejects(
    caller.table.createTable({ baseId: "base", name: "Tasks" }),
    { code: "NOT_FOUND" },
  );
  assert.equal(events.includes("table"), false);
});
void test("base and table names reject whitespace and excessive length before writing", async () => {
  const { caller, events } = setup();
  for (const name of ["", "  ", "a".repeat(101)]) {
    await assert.rejects(caller.base.createBase({ name }), {
      code: "BAD_REQUEST",
    });
    await assert.rejects(caller.table.createTable({ baseId: "base", name }), {
      code: "BAD_REQUEST",
    });
  }
  assert.deepEqual(events, []);
});
