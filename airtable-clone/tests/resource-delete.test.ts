import assert from "node:assert/strict";
import { test } from "node:test";
import type { PrismaClient } from "../generated/prisma/index.js";
process.env.SKIP_ENV_VALIDATION = "1";
Object.assign(process.env, { NODE_ENV: "test" });
const { appRouter } = await import("../src/server/api/root");
function setup(
  options: {
    owned?: boolean;
    authenticated?: boolean;
    fail?: boolean;
    empty?: boolean;
  } = {},
) {
  const events: string[] = [];
  const remove = (name: string) => async () => {
    events.push(name);
    if (options.fail && name === "cells") throw new Error("Delete failed");
    return { count: 1 };
  };
  const db = {
    $queryRaw: async (sql: TemplateStringsArray, ...values: string[]) => {
      if (values.length === 2) {
        assert.equal(values[1], "owner");
        events.push("authorize-lock");
        return options.owned === false
          ? []
          : [{ id: values[0], baseId: "base" }];
      }
      if (sql.join("?").includes('FROM "Table"'))
        return options.empty ? [] : [{ id: "table" }];
      events.push("child-lock");
      return [];
    },
    cell: { deleteMany: remove("cells") },
    row: { deleteMany: remove("rows") },
    column: { deleteMany: remove("columns") },
    table: { deleteMany: remove("tables") },
    base: { delete: remove("base") },
    $transaction: async <T>(callback: (tx: unknown) => Promise<T>) => {
      try {
        const result = await callback(db);
        events.push("commit");
        return result;
      } catch (error) {
        events.push("rollback");
        throw error;
      }
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
void test("resource deletion rejects unauthenticated and unowned requests", async () => {
  for (const options of [{ authenticated: false }, { owned: false }]) {
    const { caller, events } = setup(options);
    const code = options.authenticated === false ? "UNAUTHORIZED" : "NOT_FOUND";
    await assert.rejects(caller.base.deleteBase({ baseId: "base" }), { code });
    await assert.rejects(caller.table.deleteTable({ tableId: "table" }), {
      code,
    });
    assert.equal(events.includes("cells"), false);
    assert.equal(events.includes("base"), false);
  }
});
void test("table deletion removes children in dependency order inside the transaction", async () => {
  const { caller, events } = setup();
  assert.deepEqual(await caller.table.deleteTable({ tableId: "table" }), {
    id: "table",
    baseId: "base",
  });
  assert.deepEqual(events, [
    "authorize-lock",
    "child-lock",
    "child-lock",
    "cells",
    "rows",
    "columns",
    "tables",
    "commit",
  ]);
});
void test("base deletion removes tables and children before removing the base", async () => {
  const { caller, events } = setup();
  assert.deepEqual(await caller.base.deleteBase({ baseId: "base" }), {
    id: "base",
    tableIds: ["table"],
  });
  assert.deepEqual(events.slice(-6), [
    "cells",
    "rows",
    "columns",
    "tables",
    "base",
    "commit",
  ]);
});
void test("empty bases can be deleted and failed child deletion rolls back", async () => {
  const empty = setup({ empty: true });
  await empty.caller.base.deleteBase({ baseId: "base" });
  assert.deepEqual(empty.events, ["authorize-lock", "base", "commit"]);
  const failed = setup({ fail: true });
  await assert.rejects(
    failed.caller.base.deleteBase({ baseId: "base" }),
    /Delete failed/,
  );
  assert.equal(failed.events.at(-1), "rollback");
  assert.equal(failed.events.includes("base"), false);
  assert.equal(failed.events.includes("commit"), false);
});
