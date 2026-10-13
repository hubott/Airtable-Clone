import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { rowFilterSchema } from "~/utils/row-filter";
import type { Prisma } from "~/../generated/prisma";
import {
  getViewRows,
  rowCells,
  rowCursorSchema,
  rowSortSchema,
  type RowCursor,
} from "../queries/view-rows";
import { createTRPCRouter, protectedProcedure } from "../trpc";

// Called inside the insertion transaction; the table lock serializes order allocation.
async function reserveRowOrder(
  tx: Prisma.TransactionClient,
  tableId: string,
  ownerId: string,
  count: number,
) {
  const tables = await tx.$queryRaw<{ id: string }[]>`
    SELECT t."id" FROM "Table" t
    JOIN "Base" b ON b."id" = t."baseId"
    WHERE t."id" = ${tableId} AND b."ownerId" = ${ownerId}
    FOR UPDATE OF t
  `;
  if (!tables.length)
    throw new TRPCError({ code: "NOT_FOUND", message: "Table not found" });
  const first = await tx.row.findFirst({
    where: { tableId },
    orderBy: [{ order: "asc" }, { id: "asc" }],
    select: { order: true },
  });
  const start = first ? first.order - count : 0;
  if (start < -2147483648)
    throw new TRPCError({
      code: "CONFLICT",
      message: "Row order limit reached",
    });
  return start;
}

export const rowRouter = createTRPCRouter({
  createRows: protectedProcedure
    .input(
      z.object({
        tableId: z.string().min(1),
        count: z.number().int().min(1).max(1000),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      ctx.db.$transaction(async (tx) => {
        const start = await reserveRowOrder(
          tx,
          input.tableId,
          ctx.session.user.id,
          input.count,
        );
        const rows = await tx.row.createManyAndReturn({
          data: Array.from({ length: input.count }, (_, index) => ({
            tableId: input.tableId,
            order: start + index,
          })),
        });
        return rows
          .sort((a, b) => a.order - b.order)
          .map((row) => ({ ...row, cellsByColumnId: {} }));
      }),
    ),
  createRow: protectedProcedure
    .input(z.object({ tableId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) =>
      ctx.db.$transaction(async (tx) => {
        const order = await reserveRowOrder(
          tx,
          input.tableId,
          ctx.session.user.id,
          1,
        );
        const row = await tx.row.create({
          data: { tableId: input.tableId, order },
        });
        return { ...row, cellsByColumnId: {} };
      }),
    ),

  deleteRow: protectedProcedure
    .input(z.object({ rowId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) =>
      ctx.db.$transaction(async (tx) => {
        // Lock the owned row to coordinate concurrent deletes and dependent writes.
        const rows = await tx.$queryRaw<{ id: string }[]>`
        SELECT r."id" FROM "Row" r
        JOIN "Table" t ON t."id" = r."tableId"
        JOIN "Base" b ON b."id" = t."baseId"
        WHERE r."id" = ${input.rowId} AND b."ownerId" = ${ctx.session.user.id}
        FOR UPDATE OF r
      `;
        if (!rows.length)
          throw new TRPCError({ code: "NOT_FOUND", message: "Row not found" });
        await tx.cell.deleteMany({ where: { rowId: input.rowId } });
        await tx.row.delete({ where: { id: input.rowId } });
        return { id: input.rowId };
      }),
    ),

  getRows: protectedProcedure
    .input(
      z.object({
        tableId: z.string(),
        cursor: rowCursorSchema.nullish(),
        sort: rowSortSchema.optional(),
        filter: rowFilterSchema.optional(),
        take: z.number().int().min(1).max(1000).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      const table = await ctx.db.table.findFirst({
        where: { id: input.tableId, base: { ownerId: ctx.session.user.id } },
        select: { id: true },
      });
      if (!table)
        throw new TRPCError({ code: "NOT_FOUND", message: "Table not found" });

      if (
        (!input.sort && input.cursor?.sort) ||
        (!input.filter && input.cursor?.filter)
      )
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "View changed. Reload rows from the beginning.",
        });
      const sort = input.sort;
      const viewPage =
        sort || input.filter
          ? await ctx.db.$transaction(
              (tx) =>
                getViewRows(tx, {
                  ...input,
                  sort,
                  ownerId: ctx.session.user.id,
                }),
              { isolationLevel: "RepeatableRead" },
            )
          : null;
      const rows =
        viewPage?.rows ??
        (await ctx.db.row.findMany({
          where: {
            tableId: input.tableId,
            ...(input.cursor
              ? {
                  OR: [
                    { order: { gt: input.cursor.order } },
                    { order: input.cursor.order, id: { gt: input.cursor.id } },
                  ],
                }
              : {}),
          },
          take: input.take,
          orderBy: [{ order: "asc" }, { id: "asc" }],
          include: rowCells,
        }));
      const formattedRows = rows.map(({ cells, ...row }) => ({
        ...row,
        cellsByColumnId: Object.fromEntries(
          cells.map((cell) => [cell.columnId, cell]),
        ),
      }));
      const lastRow = formattedRows.at(-1);
      const nextCursor: RowCursor | null = viewPage
        ? viewPage.nextCursor
        : formattedRows.length < input.take
          ? null
          : lastRow
            ? { id: lastRow.id, order: lastRow.order }
            : null;
      return { formattedRows, nextCursor };
    }),
});
