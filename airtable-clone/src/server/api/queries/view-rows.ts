import { TRPCError } from "@trpc/server";
import { Prisma } from "~/../generated/prisma";
import { z } from "zod";
import {
  rowFilterSchema,
  rowFilterKey,
  type RowFilter,
} from "~/utils/row-filter";
import { rowSearchSchema } from "~/utils/row-search";
import { rowSearchSql } from "./row-search";
import { rowFilterSql } from "./row-filter";

export const rowSortSchema = z.object({
  columnId: z.string().min(1),
  direction: z.enum(["asc", "desc"]),
});
export const rowCursorSchema = z.object({
  id: z.string().min(1),
  order: z.number().int(),
  filter: rowFilterSchema.optional(),
  search: rowSearchSchema,
  sort: rowSortSchema
    .extend({
      type: z.enum(["TEXT", "NUMBER"]),
      value: z.union([z.string(), z.number().finite(), z.null()]),
    })
    .optional(),
});
export type RowCursor = z.infer<typeof rowCursorSchema>;

export const rowCells = {
  cells: {
    select: {
      rowId: true,
      columnId: true,
      textValue: true,
      numberValue: true,
    },
  },
} satisfies Prisma.RowInclude;

// Called in a repeatable-read transaction so page values and hydrated cells agree.
export async function getViewRows(
  tx: Prisma.TransactionClient,
  input: {
    tableId: string;
    ownerId: string;
    take: number;
    sort?: z.infer<typeof rowSortSchema>;
    filter?: RowFilter;
    search?: string;
    cursor?: RowCursor | null;
  },
) {
  async function ownedColumnType(columnId: string) {
    const column = await tx.column.findFirst({
      where: {
        id: columnId,
        tableId: input.tableId,
        table: { base: { ownerId: input.ownerId } },
      },
      select: { type: true },
    });
    if (!column)
      throw new TRPCError({ code: "NOT_FOUND", message: "Column not found" });
    return column.type;
  }
  const search = rowSearchSchema.parse(input.search);
  if (input.cursor && rowSearchSchema.parse(input.cursor.search) !== search)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Search changed. Reload rows from the beginning.",
    });
  const sort = input.sort;
  const sortType = sort ? await ownedColumnType(sort.columnId) : undefined;
  if (
    input.filter &&
    (await ownedColumnType(input.filter.columnId)) !== input.filter.type
  )
    throw new TRPCError({
      code: "CONFLICT",
      message: "Filtered column type changed. Clear or reapply the filter.",
    });
  if (
    input.cursor &&
    rowFilterKey(input.cursor.filter) !== rowFilterKey(input.filter)
  )
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Filter changed. Reload rows from the beginning.",
    });
  if (!sort && input.cursor?.sort)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Sort changed. Reload rows from the beginning.",
    });
  const boundary = input.cursor?.sort;
  if (
    sort &&
    input.cursor &&
    (!boundary ||
      boundary.columnId !== sort.columnId ||
      boundary.direction !== sort.direction ||
      boundary.type !== sortType ||
      (boundary.value !== null &&
        typeof boundary.value !== (sortType === "TEXT" ? "string" : "number")))
  )
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Sort changed. Reload rows from the beginning.",
    });

  // All SQL fragments are fixed choices; identifiers/directions never come from raw input.
  // C collation gives text comparisons and ordering the same deterministic semantics.
  const value = !sort
    ? Prisma.sql`NULL::text`
    : sortType === "TEXT"
      ? Prisma.sql`c."textValue" COLLATE "C"`
      : Prisma.sql`c."numberValue"`;
  const direction =
    sort?.direction === "desc" ? Prisma.sql`DESC` : Prisma.sql`ASC`;
  let after = Prisma.empty;
  if (!sort && input.cursor)
    after = Prisma.sql`AND (r."order", r."id") > (${input.cursor.order}, ${input.cursor.id})`;
  if (sort && input.cursor && boundary) {
    const tie = Prisma.sql`(r."order", r."id") > (${input.cursor.order}, ${input.cursor.id})`;
    after =
      boundary.value === null
        ? Prisma.sql`AND (${value} IS NULL AND ${tie})`
        : Prisma.sql`AND (
          ${value} IS NULL OR
          ${value} ${sort.direction === "asc" ? Prisma.sql`>` : Prisma.sql`<`} ${boundary.value} OR
          (${value} = ${boundary.value} AND ${tie})
        )`;
  }
  const page = await tx.$queryRaw<
    { id: string; order: number; value: string | number | null }[]
  >(Prisma.sql`
    SELECT r."id", r."order", ${value} AS "value"
    FROM "Row" r
    JOIN "Table" t ON t."id" = r."tableId"
    JOIN "Base" b ON b."id" = t."baseId"
    ${sort ? Prisma.sql`LEFT JOIN "Cell" c ON c."rowId" = r."id" AND c."columnId" = ${sort.columnId}` : Prisma.empty}
    WHERE r."tableId" = ${input.tableId} AND b."ownerId" = ${input.ownerId}
    ${rowFilterSql(input.filter)}
    ${rowSearchSql(search)}
    ${after}
    ORDER BY ${sort ? Prisma.sql`${value} ${direction} NULLS LAST,` : Prisma.empty} r."order" ASC, r."id" ASC
    LIMIT ${input.take}
  `);
  const rows = await tx.row.findMany({
    where: { tableId: input.tableId, id: { in: page.map((row) => row.id) } },
    include: rowCells,
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  const last = page.at(-1);
  return {
    rows: page.flatMap((entry) => {
      const row = byId.get(entry.id);
      return row ? [row] : [];
    }),
    nextCursor:
      page.length === input.take && last
        ? {
            id: last.id,
            order: last.order,
            ...(sort && sortType
              ? { sort: { ...sort, type: sortType, value: last.value } }
              : {}),
            ...(input.filter ? { filter: input.filter } : {}),
            ...(search ? { search } : {}),
          }
        : null,
  };
}
