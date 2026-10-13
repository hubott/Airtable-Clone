import { TRPCError } from "@trpc/server";
import { Prisma } from "~/../generated/prisma";
import { z } from "zod";

export const rowSortSchema = z.object({
  columnId: z.string().min(1),
  direction: z.enum(["asc", "desc"]),
});
export const rowCursorSchema = z.object({
  id: z.string().min(1),
  order: z.number().int(),
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
export async function getSortedRows(
  tx: Prisma.TransactionClient,
  input: {
    tableId: string;
    ownerId: string;
    take: number;
    sort: z.infer<typeof rowSortSchema>;
    cursor?: RowCursor | null;
  },
) {
  const column = await tx.column.findFirst({
    where: {
      id: input.sort.columnId,
      tableId: input.tableId,
      table: { base: { ownerId: input.ownerId } },
    },
    select: { type: true },
  });
  if (!column)
    throw new TRPCError({ code: "NOT_FOUND", message: "Column not found" });
  const boundary = input.cursor?.sort;
  if (
    input.cursor &&
    (!boundary ||
      boundary.columnId !== input.sort.columnId ||
      boundary.direction !== input.sort.direction ||
      boundary.type !== column.type ||
      (boundary.value !== null &&
        typeof boundary.value !==
          (column.type === "TEXT" ? "string" : "number")))
  )
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Sort changed. Reload rows from the beginning.",
    });

  // All SQL fragments are fixed choices; identifiers/directions never come from raw input.
  // C collation gives text comparisons and ordering the same deterministic semantics.
  const value =
    column.type === "TEXT"
      ? Prisma.sql`c."textValue" COLLATE "C"`
      : Prisma.sql`c."numberValue"`;
  const direction =
    input.sort.direction === "asc" ? Prisma.sql`ASC` : Prisma.sql`DESC`;
  let after = Prisma.empty;
  if (input.cursor && boundary) {
    const tie = Prisma.sql`(r."order", r."id") > (${input.cursor.order}, ${input.cursor.id})`;
    after =
      boundary.value === null
        ? Prisma.sql`AND (${value} IS NULL AND ${tie})`
        : Prisma.sql`AND (
          ${value} IS NULL OR
          ${value} ${input.sort.direction === "asc" ? Prisma.sql`>` : Prisma.sql`<`} ${boundary.value} OR
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
    LEFT JOIN "Cell" c ON c."rowId" = r."id" AND c."columnId" = ${input.sort.columnId}
    WHERE r."tableId" = ${input.tableId} AND b."ownerId" = ${input.ownerId}
    ${after}
    ORDER BY ${value} ${direction} NULLS LAST, r."order" ASC, r."id" ASC
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
            sort: { ...input.sort, type: column.type, value: last.value },
          }
        : null,
  };
}
