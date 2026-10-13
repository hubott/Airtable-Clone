import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";

export const columnRouter = createTRPCRouter({
  createColumn: protectedProcedure
    .input(
      z.object({
        tableId: z.string().min(1),
        name: z
          .string()
          .trim()
          .min(1, "Enter a column name")
          .max(100, "Use at most 100 characters"),
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
