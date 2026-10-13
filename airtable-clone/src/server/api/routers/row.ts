import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";

export const rowRouter = createTRPCRouter({
  createRow: protectedProcedure
    .input(z.object({ tableId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) =>
      ctx.db.$transaction(async (tx) => {
        // Lock this owned table so concurrent inserts cannot allocate the same order.
        const tables = await tx.$queryRaw<{ id: string }[]>`
        SELECT t."id" FROM "Table" t
        JOIN "Base" b ON b."id" = t."baseId"
        WHERE t."id" = ${input.tableId} AND b."ownerId" = ${ctx.session.user.id}
        FOR UPDATE OF t
      `;
        if (!tables.length)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Table not found",
          });
        const first = await tx.row.findFirst({
          where: { tableId: input.tableId },
          orderBy: [{ order: "asc" }, { id: "asc" }],
          select: { order: true },
        });
        if (first && first.order <= -2147483648)
          throw new TRPCError({
            code: "CONFLICT",
            message: "Row order limit reached",
          });
        const row = await tx.row.create({
          data: { tableId: input.tableId, order: first ? first.order - 1 : 0 },
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
        cursor: z
          .object({ id: z.string().min(1), order: z.number().int() })
          .nullish(),
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

      const rows = await ctx.db.row.findMany({
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
        include: {
          cells: {
            select: {
              rowId: true,
              columnId: true,
              textValue: true,
              numberValue: true,
            },
          },
        },
      });
      const formattedRows = rows.map(({ cells, ...row }) => ({
        ...row,
        cellsByColumnId: Object.fromEntries(
          cells.map((cell) => [cell.columnId, cell]),
        ),
      }));
      const lastRow = formattedRows.at(-1);
      const nextCursor =
        formattedRows.length < input.take
          ? null
          : lastRow
            ? { id: lastRow.id, order: lastRow.order }
            : null;
      return { formattedRows, nextCursor };
    }),
});
