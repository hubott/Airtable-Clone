import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { test } from "node:test";
import type { RowFilter } from "../src/utils/row-filter";
import { PrismaClient } from "../generated/prisma/index.js";
import {
  getViewRows,
  type RowCursor,
} from "../src/server/api/queries/view-rows";

// Opt in with a dedicated local database. Only a uniquely named temporary schema is modified.
const databaseUrl = process.env.SORT_TEST_DATABASE_URL;
void test(
  "PostgreSQL sorting and pagination",
  { skip: !databaseUrl },
  async (t) => {
    if (!databaseUrl) return;
    const schema = `sort_test_${randomUUID().replaceAll("-", "")}`;
    const admin = new PrismaClient({ datasourceUrl: databaseUrl });
    const url = new URL(databaseUrl);
    url.searchParams.set("schema", schema);
    const db = new PrismaClient({ datasourceUrl: url.toString() });
    try {
      await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
      for (const statement of [
        `CREATE TYPE "ColumnType" AS ENUM ('TEXT', 'NUMBER')`,
        `CREATE TABLE "Base" ("id" TEXT PRIMARY KEY, "ownerId" TEXT NOT NULL)`,
        `CREATE TABLE "Table" ("id" TEXT PRIMARY KEY, "baseId" TEXT NOT NULL REFERENCES "Base")`,
        `CREATE TABLE "Column" ("id" TEXT PRIMARY KEY, "tableId" TEXT NOT NULL REFERENCES "Table", "type" "ColumnType" NOT NULL)`,
        `CREATE TABLE "Row" ("id" TEXT PRIMARY KEY, "tableId" TEXT NOT NULL REFERENCES "Table", "order" INTEGER NOT NULL)`,
        `CREATE TABLE "Cell" ("id" TEXT PRIMARY KEY, "rowId" TEXT NOT NULL REFERENCES "Row", "columnId" TEXT NOT NULL REFERENCES "Column", "textValue" TEXT, "numberValue" DOUBLE PRECISION, UNIQUE ("rowId", "columnId"))`,
        `CREATE INDEX ON "Row" ("tableId")`,
        `CREATE INDEX ON "Cell" ("columnId", "textValue")`,
        `CREATE INDEX ON "Cell" ("columnId", "numberValue")`,
        `CREATE INDEX ON "Cell" ("rowId")`,
        `INSERT INTO "Base" VALUES ('base', 'owner'), ('other-base', 'other-owner')`,
        `INSERT INTO "Table" VALUES ('table', 'base'), ('other-table', 'other-base')`,
        `INSERT INTO "Column" VALUES ('text', 'table', 'TEXT'), ('number', 'table', 'NUMBER'), ('other', 'other-table', 'TEXT')`,
        `INSERT INTO "Row" VALUES ('a', 'table', 0), ('b', 'table', 0), ('c', 'table', 0), ('d', 'table', 3), ('e', 'table', 4), ('f', 'table', 5), ('hidden', 'other-table', 0)`,
        `INSERT INTO "Cell" VALUES ('ta', 'a', 'text', 'Beta', NULL), ('tb', 'b', 'text', 'Alpha', NULL), ('tc', 'c', 'text', 'Alpha', NULL), ('td', 'd', 'text', 'alpha', NULL), ('te', 'e', 'text', NULL, NULL), ('na', 'a', 'number', NULL, 10), ('nb', 'b', 'number', NULL, -2), ('nc', 'c', 'number', NULL, 0), ('nd', 'd', 'number', NULL, 10), ('ne', 'e', 'number', NULL, NULL)`,
      ])
        await db.$executeRawUnsafe(statement);

      const page = (
        columnId: string,
        direction: "asc" | "desc",
        cursor?: RowCursor | null,
        take = 2,
      ) =>
        db.$transaction(
          (tx) =>
            getViewRows(tx, {
              tableId: "table",
              ownerId: "owner",
              take,
              sort: { columnId, direction },
              cursor,
            }),
          { isolationLevel: "RepeatableRead" },
        );
      const all = async (columnId: string, direction: "asc" | "desc") => {
        const ids: string[] = [];
        let cursor: RowCursor | null | undefined;
        do {
          const result = await page(columnId, direction, cursor);
          ids.push(...result.rows.map((row) => row.id));
          cursor = result.nextCursor;
        } while (cursor);
        return ids;
      };
      const filteredPage = (
        filter: RowFilter,
        cursor?: RowCursor | null,
        sort?: { columnId: string; direction: "asc" | "desc" },
        take = 1,
      ) =>
        db.$transaction(
          (tx) =>
            getViewRows(tx, {
              tableId: "table",
              ownerId: "owner",
              take,
              filter,
              sort,
              cursor,
            }),
          { isolationLevel: "RepeatableRead" },
        );
      const filteredIds = async (
        filter: RowFilter,
        sort?: { columnId: string; direction: "asc" | "desc" },
      ) => {
        const ids: string[] = [];
        let cursor: RowCursor | null | undefined;
        do {
          const result = await filteredPage(filter, cursor, sort);
          ids.push(...result.rows.map((row) => row.id));
          cursor = result.nextCursor;
        } while (cursor);
        return ids;
      };
      const textFilter = (
        operator: "contains" | "equals" | "startsWith",
        value: string,
      ): RowFilter => ({ columnId: "text", type: "TEXT", operator, value });
      const numberFilter = (
        operator: "equals" | "gt" | "gte" | "lt" | "lte",
        value: number,
      ): RowFilter => ({ columnId: "number", type: "NUMBER", operator, value });
      await t.test(
        "text matching ignores case, supports literal wildcards and combines with both sort directions",
        async () => {
          assert.deepEqual(await filteredIds(textFilter("contains", "ALP")), [
            "b",
            "c",
            "d",
          ]);
          assert.deepEqual(await filteredIds(textFilter("equals", "ALPHA")), [
            "b",
            "c",
            "d",
          ]);
          assert.deepEqual(await filteredIds(textFilter("startsWith", "be")), [
            "a",
          ]);
          assert.deepEqual(
            await filteredIds(textFilter("contains", "missing")),
            [],
          );
          assert.deepEqual(
            await filteredIds(textFilter("contains", "a"), {
              columnId: "number",
              direction: "desc",
            }),
            ["a", "d", "c", "b"],
          );
          assert.deepEqual(
            await filteredIds(textFilter("contains", "alp"), {
              columnId: "text",
              direction: "asc",
            }),
            ["b", "c", "d"],
          );
          assert.deepEqual(
            await filteredIds(textFilter("contains", "alp"), {
              columnId: "text",
              direction: "desc",
            }),
            ["d", "b", "c"],
          );
          const literal = "50%_\\'; SELECT 1; --";
          await db.$executeRaw`UPDATE "Cell" SET "textValue" = ${literal} WHERE "id" = 'ta'`;
          assert.deepEqual(await filteredIds(textFilter("contains", "%_")), [
            "a",
          ]);
          assert.deepEqual(await filteredIds(textFilter("equals", literal)), [
            "a",
          ]);
          await db.$executeRaw`UPDATE "Cell" SET "textValue" = 'Beta' WHERE "id" = 'ta'`;
        },
      );
      await t.test(
        "numeric comparisons distinguish negative numbers, zero, strict and inclusive boundaries",
        async () => {
          for (const [operator, value, expected] of [
            ["equals", 0, ["c"]],
            ["gt", 0, ["a", "d"]],
            ["gte", 0, ["a", "c", "d"]],
            ["lt", 0, ["b"]],
            ["lte", 0, ["b", "c"]],
            ["equals", 10, ["a", "d"]],
          ] as const)
            assert.deepEqual(
              await filteredIds(numberFilter(operator, value)),
              expected,
            );
        },
      );
      await t.test(
        "empty checks include explicit nulls and missing cells for both types",
        async () => {
          for (const [columnId, type] of [
            ["text", "TEXT"],
            ["number", "NUMBER"],
          ] as const) {
            assert.deepEqual(
              await filteredIds({ columnId, type, operator: "isEmpty" }),
              ["e", "f"],
            );
            assert.deepEqual(
              await filteredIds({ columnId, type, operator: "isNotEmpty" }),
              ["a", "b", "c", "d"],
            );
          }
        },
      );
      await t.test(
        "filter columns require ownership and current types; changed filter cursors are rejected",
        async () => {
          await assert.rejects(
            filteredPage({
              columnId: "other",
              type: "TEXT",
              operator: "isEmpty",
            }),
            { code: "NOT_FOUND" },
          );
          await assert.rejects(
            filteredPage({
              columnId: "number",
              type: "TEXT",
              operator: "equals",
              value: "0",
            }),
            { code: "CONFLICT" },
          );
          const first = await filteredPage(numberFilter("gte", 0));
          await assert.rejects(
            filteredPage(numberFilter("gte", 10), first.nextCursor),
            { code: "BAD_REQUEST" },
          );
        },
      );
      await t.test(
        "all pages include ties, zero, negatives, absent cells and explicit blanks exactly once",
        async () => {
          assert.deepEqual(await all("text", "asc"), [
            "b",
            "c",
            "a",
            "d",
            "e",
            "f",
          ]);
          assert.deepEqual(await all("text", "desc"), [
            "d",
            "a",
            "b",
            "c",
            "e",
            "f",
          ]);
          assert.deepEqual(await all("number", "asc"), [
            "b",
            "c",
            "a",
            "d",
            "e",
            "f",
          ]);
          assert.deepEqual(await all("number", "desc"), [
            "a",
            "d",
            "c",
            "b",
            "e",
            "f",
          ]);
        },
      );
      await t.test(
        "unowned tables and unrelated columns cannot be read",
        async () => {
          await assert.rejects(page("other", "asc"), { code: "NOT_FOUND" });
          await assert.rejects(
            db.$transaction((tx) =>
              getViewRows(tx, {
                tableId: "table",
                ownerId: "other-owner",
                take: 2,
                sort: { columnId: "text", direction: "asc" },
              }),
            ),
            { code: "NOT_FOUND" },
          );
        },
      );
      await t.test(
        "deleted cursor rows still advance at the recorded value boundary",
        async () => {
          const first = await page("text", "asc", null, 1);
          const firstFiltered = await filteredPage(
            textFilter("contains", "alp"),
          );
          await db.$executeRaw`DELETE FROM "Cell" WHERE "rowId" = 'b'`;
          await db.$executeRaw`DELETE FROM "Row" WHERE "id" = 'b'`;
          assert.equal(
            (
              await filteredPage(
                textFilter("contains", "alp"),
                firstFiltered.nextCursor,
              )
            ).rows[0]?.id,
            "c",
          );
          assert.deepEqual(
            (await page("text", "asc", first.nextCursor)).rows.map(
              (row) => row.id,
            ),
            ["c", "a"],
          );
        },
      );
      await t.test(
        "quoted text values are parameterized and a new read reflects edits",
        async () => {
          await db.$executeRaw`UPDATE "Cell" SET "textValue" = ${'\'; DROP TABLE "Row"; --'} WHERE "id" = 'ta'`;
          assert.equal((await page("text", "asc")).rows[0]?.id, "a");
          assert.deepEqual(await all("text", "desc"), [
            "d",
            "c",
            "a",
            "e",
            "f",
          ]);
        },
      );
      await t.test(
        "blank cursor pagination survives deletion and changed column types reject old cursors",
        async () => {
          const blanks = await page("text", "asc", null, 4);
          assert.equal(blanks.nextCursor?.sort?.value, null);
          await db.$executeRaw`DELETE FROM "Cell" WHERE "rowId" = 'e'`;
          await db.$executeRaw`DELETE FROM "Row" WHERE "id" = 'e'`;
          assert.deepEqual(
            (await page("text", "asc", blanks.nextCursor)).rows.map(
              (row) => row.id,
            ),
            ["f"],
          );
          const numbers = await page("number", "asc");
          await db.$executeRaw`UPDATE "Column" SET "type" = 'TEXT' WHERE "id" = 'number'`;
          await assert.rejects(page("number", "asc", numbers.nextCursor), {
            code: "BAD_REQUEST",
          });
          await db.$executeRaw`UPDATE "Column" SET "type" = 'NUMBER' WHERE "id" = 'number'`;
        },
      );
      await t.test(
        "100,000-row first and subsequent pages remain bounded",
        async () => {
          await db.$executeRaw`INSERT INTO "Row" SELECT 'large-' || i, 'table', i FROM generate_series(1, 100000) i`;
          await db.$executeRaw`INSERT INTO "Cell" SELECT 'large-cell-' || i, 'large-' || i, 'number', NULL, (i % 1000)::double precision FROM generate_series(1, 100000) i`;
          await db.$executeRawUnsafe('ANALYZE "Row"');
          await db.$executeRawUnsafe('ANALYZE "Cell"');
          const start = performance.now();
          const first = await page("number", "asc", null, 200);
          const middle = performance.now();
          const next = await page("number", "asc", first.nextCursor, 200);
          const end = performance.now();
          const filteredStart = performance.now();
          const firstFiltered = await filteredPage(
            numberFilter("gte", 500),
            undefined,
            { columnId: "number", direction: "asc" },
            200,
          );
          const nextFiltered = await filteredPage(
            numberFilter("gte", 500),
            firstFiltered.nextCursor,
            { columnId: "number", direction: "asc" },
            200,
          );
          assert.equal(firstFiltered.rows.length, 200);
          assert.equal(
            new Set(
              [...firstFiltered.rows, ...nextFiltered.rows].map(
                (row) => row.id,
              ),
            ).size,
            400,
          );
          t.diagnostic(
            `100k rows: two filtered/sorted pages ${(performance.now() - filteredStart).toFixed(1)}ms total`,
          );
          assert.equal(first.rows.length, 200);
          assert.equal(next.rows.length, 200);
          assert.equal(
            new Set([...first.rows, ...next.rows].map((row) => row.id)).size,
            400,
          );
          t.diagnostic(
            `100k rows: first page ${(middle - start).toFixed(1)}ms; next page ${(end - middle).toFixed(1)}ms (local synthetic data)`,
          );
        },
      );
    } finally {
      await db.$disconnect();
      await admin.$executeRawUnsafe(
        `DROP SCHEMA IF EXISTS "${schema}" CASCADE`,
      );
      await admin.$disconnect();
    }
  },
);
