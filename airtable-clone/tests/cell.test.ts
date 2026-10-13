import assert from "node:assert/strict";
import { test } from "node:test";
import type { PrismaClient } from "../generated/prisma/index.js";

process.env.SKIP_ENV_VALIDATION = "1";
Object.assign(process.env, { NODE_ENV: "test" });
const { appRouter } = await import("../src/server/api/root");

type Values = { textValue: string | null; numberValue: number | null };

function setup(
  options: {
    owned?: boolean;
    sameTable?: boolean;
    type?: "TEXT" | "NUMBER";
    authenticated?: boolean;
  } = {},
) {
  const writes: Values[] = [];
  const database = {
    row: {
      findFirst: async (args: {
        where: { id: string; table: { base: { ownerId: string } } };
      }) => {
        assert.equal(args.where.table.base.ownerId, "owner");
        return options.owned === false ? null : { tableId: "table" };
      },
    },
    $queryRaw: async (
      sql: TemplateStringsArray,
      columnId: string,
      tableId: string,
    ) => {
      assert.equal(columnId, "column");
      assert.equal(tableId, "table");
      assert.match(sql.join("?"), /FOR SHARE/);
      return options.sameTable === false
        ? []
        : [{ type: options.type ?? "TEXT" }];
    },
    cell: {
      upsert: async (args: {
        create: Values & { rowId: string; columnId: string };
        update: Values;
      }) => {
        writes.push(args.update);
        assert.deepEqual(args.update, {
          textValue: args.create.textValue,
          numberValue: args.create.numberValue,
        });
        return args.create;
      },
    },
    $transaction: async <T>(callback: (tx: unknown) => Promise<T>) =>
      callback(database),
  };
  const caller = appRouter.createCaller({
    db: database as unknown as PrismaClient,
    headers: new Headers(),
    session:
      options.authenticated === false
        ? null
        : { user: { id: "owner" }, expires: "2099-01-01" },
  });
  return { caller, writes };
}

const input = { rowId: "row", columnId: "column" };

for (const [name, options, code] of [
  ["unauthenticated", { authenticated: false }, "UNAUTHORIZED"],
  ["missing or unowned row", { owned: false }, "NOT_FOUND"],
  ["missing or cross-table column", { sameTable: false }, "NOT_FOUND"],
] as const) {
  void test(`rejects ${name} without writing`, async () => {
    const { caller, writes } = setup(options);
    await assert.rejects(caller.cell.updateCell({ ...input, value: "hello" }), {
      code,
    });
    assert.equal(writes.length, 0);
  });
}

void test("saves text verbatim and clears stale numeric data", async () => {
  const { caller } = setup();
  assert.deepEqual(
    await caller.cell.updateCell({ ...input, value: "  hello  " }),
    {
      ...input,
      textValue: "  hello  ",
      numberValue: null,
    },
  );
});

void test("saves finite decimal values including zero and scientific notation", async () => {
  const { caller } = setup({ type: "NUMBER" });
  for (const value of ["0", "-12.5", " .5 ", "1e3"]) {
    assert.deepEqual(await caller.cell.updateCell({ ...input, value }), {
      ...input,
      textValue: null,
      numberValue: Number(value),
    });
  }
});

void test("clears text and numeric cells without converting blank numbers to zero", async () => {
  for (const type of ["TEXT", "NUMBER"] as const) {
    const { caller } = setup({ type });
    const value = type === "TEXT" ? "" : "  ";
    assert.deepEqual(await caller.cell.updateCell({ ...input, value }), {
      ...input,
      textValue: null,
      numberValue: null,
    });
  }
});

void test("rejects invalid or nonfinite numbers without writing", async () => {
  const { caller, writes } = setup({ type: "NUMBER" });
  for (const value of [
    "abc",
    "12abc",
    "NaN",
    "Infinity",
    "1e999",
    "0x10",
    "1,000",
  ]) {
    await assert.rejects(caller.cell.updateCell({ ...input, value }), {
      code: "BAD_REQUEST",
    });
  }
  assert.equal(writes.length, 0);
});

void test("grid queries scope table access to the session owner", async () => {
  let rowReads = 0;
  const database = {
    table: {
      findFirst: async (args: { where: { base: { ownerId: string } } }) => {
        assert.equal(args.where.base.ownerId, "owner");
        return null;
      },
      findMany: async (args: { where: { base: { ownerId: string } } }) => {
        assert.equal(args.where.base.ownerId, "owner");
        return [];
      },
    },
    row: {
      findMany: async () => {
        rowReads++;
        return [];
      },
    },
  };
  const caller = appRouter.createCaller({
    db: database as unknown as PrismaClient,
    headers: new Headers(),
    session: { user: { id: "owner" }, expires: "2099-01-01" },
  });
  await assert.rejects(
    caller.table.getTableWithColumns({ tableId: "other-table" }),
    { code: "NOT_FOUND" },
  );
  await assert.rejects(caller.row.getRows({ tableId: "other-table" }), {
    code: "NOT_FOUND",
  });
  assert.deepEqual(
    await caller.table.getTablesByBase({ baseId: "other-base" }),
    [],
  );
  assert.equal(rowReads, 0);
});
