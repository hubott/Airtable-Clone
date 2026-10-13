import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { parseCellValue } from "~/utils/cell-value";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";

export const cellRouter = createTRPCRouter({
  updateCell: protectedProcedure
    .input(
      z.object({
        rowId: z.string().min(1),
        columnId: z.string().min(1),
        value: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.$transaction(async (tx) => {
        // Derive the table and type from owned records, never from client input.
        const row = await tx.row.findFirst({
          where: {
            id: input.rowId,
            table: { base: { ownerId: ctx.session.user.id } },
          },
          select: { tableId: true },
        });
        if (!row)
          throw new TRPCError({ code: "NOT_FOUND", message: "Row not found" });

        const column = await tx.column.findFirst({
          where: { id: input.columnId, tableId: row.tableId },
          select: { type: true },
        });
        if (!column)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Column not found",
          });

        let values: ReturnType<typeof parseCellValue>;
        try {
          values = parseCellValue(column.type, input.value);
        } catch {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Enter a valid finite number",
          });
        }

        return tx.cell.upsert({
          where: {
            rowId_columnId: { rowId: input.rowId, columnId: input.columnId },
          },
          create: { rowId: input.rowId, columnId: input.columnId, ...values },
          update: values,
          select: {
            rowId: true,
            columnId: true,
            textValue: true,
            numberValue: true,
          },
        });
      });
    }),
});
