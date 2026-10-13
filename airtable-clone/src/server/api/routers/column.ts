import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";

const columnName = z
  .string()
  .trim()
  .min(1, "Enter a column name")
  .max(100, "Use at most 100 characters");

export const columnRouter = createTRPCRouter({
  renameColumn: protectedProcedure
    .input(z.object({ columnId: z.string().min(1), name: columnName }))
    .mutation(async ({ ctx, input }) => {
      // Apply authorization in the write itself, avoiding a check/write race.
      const columns = await ctx.db.column.updateManyAndReturn({
        where: {
          id: input.columnId,
          table: { base: { ownerId: ctx.session.user.id } },
        },
        data: { name: input.name },
      });
      const column = columns[0];
      if (!column)
        throw new TRPCError({ code: "NOT_FOUND", message: "Column not found" });
      return column;
    }),
  createColumn: protectedProcedure
    .input(
      z.object({
        tableId: z.string().min(1),
        name: columnName,
        type: z.enum(["TEXT", "NUMBER"]),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      ctx.db.$transaction(async (tx) => {
        // Serialize order allocation and verify ownership in the same locked query.
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
        const last = await tx.column.findFirst({
          where: { tableId: input.tableId },
          orderBy: [{ order: "desc" }, { id: "desc" }],
          select: { order: true },
        });
        if (last && last.order >= 2147483647)
          throw new TRPCError({
            code: "CONFLICT",
            message: "Column order limit reached",
          });
        // Cells are created lazily by updateCell; no writes across existing rows.
        return tx.column.create({
          data: { ...input, order: last ? last.order + 1 : 0 },
        });
      }),
    ),
});
