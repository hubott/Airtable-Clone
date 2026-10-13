import assert from "node:assert/strict";
import { test } from "node:test";
import type { PrismaClient } from "../generated/prisma/index.js";
process.env.SKIP_ENV_VALIDATION = "1";
Object.assign(process.env, { NODE_ENV: "test" });
const { appRouter } = await import("../src/server/api/root");
function setup(options: { authenticated?: boolean; owned?: boolean } = {}) {
  let writes = 0;
  const db = {
    base: {
      updateManyAndReturn: async (args: {
        where: { id: string; ownerId: string };
        data: { name: string };
      }) => {
        assert.equal(args.where.ownerId, "owner");
        if (options.owned === false) return [];
        writes++;
        return [{ id: args.where.id, name: args.data.name }];
      },
    },
    table: {
      updateManyAndReturn: async (args: {
        where: { id: string; base: { ownerId: string } };
        data: { name: string };
      }) => {
        assert.equal(args.where.base.ownerId, "owner");
        if (options.owned === false) return [];
        writes++;
        return [{ id: args.where.id, baseId: "base", name: args.data.name }];
      },
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
    getWrites: () => writes,
  };
}
void test("base and table rename trim names and preserve identity and membership", async () => {
  const { caller } = setup();
  assert.deepEqual(
    await caller.base.renameBase({ baseId: "base", name: "  Projects  " }),
    { id: "base", name: "Projects" },
  );
  assert.deepEqual(
    await caller.table.renameTable({ tableId: "table", name: "  Tasks  " }),
    { id: "table", baseId: "base", name: "Tasks" },
  );
});
void test("renaming rejects anonymous and unowned resource requests", async () => {
  for (const options of [{ authenticated: false }, { owned: false }]) {
    const { caller, getWrites } = setup(options);
    const code = options.authenticated === false ? "UNAUTHORIZED" : "NOT_FOUND";
    await assert.rejects(
      caller.base.renameBase({ baseId: "base", name: "New" }),
      { code },
    );
    await assert.rejects(
      caller.table.renameTable({ tableId: "table", name: "New" }),
      { code },
    );
    assert.equal(getWrites(), 0);
  }
});
void test("base and table rename reject invalid names before writing", async () => {
  const { caller, getWrites } = setup();
  for (const name of ["", "  ", "a".repeat(101)]) {
    await assert.rejects(caller.base.renameBase({ baseId: "base", name }), {
      code: "BAD_REQUEST",
    });
    await assert.rejects(caller.table.renameTable({ tableId: "table", name }), {
      code: "BAD_REQUEST",
    });
  }
  assert.equal(getWrites(), 0);
});
