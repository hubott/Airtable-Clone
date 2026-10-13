import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";

export const rowRouter = createTRPCRouter({
  getRows: protectedProcedure
    .input(
      z.object({
        tableId: z.string(),
        cursor: z.string().nullish(),
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

      if (input.cursor) {
        const cursor = await ctx.db.row.findFirst({
          where: { id: input.cursor, tableId: input.tableId },
          select: { id: true },
        });
        if (!cursor)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Invalid row cursor",
          });
      }

      const rows = await ctx.db.row.findMany({
        where: { tableId: input.tableId },
        take: input.take,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        skip: input.cursor ? 1 : 0,
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
      const nextCursor =
        formattedRows.length < input.take
          ? null
          : (formattedRows[formattedRows.length - 1]?.id ?? null);
      return { formattedRows, nextCursor };
    }),
});
