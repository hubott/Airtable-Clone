import { z } from "zod";
import { TRPCError } from "@trpc/server"

import {
  createTRPCRouter,
  protectedProcedure,
} from "~/server/api/trpc";

export const tableRouter = createTRPCRouter({
  getTableWithColumns: protectedProcedure
    .input(z.object({ tableId: z.string() }))
    .query(async ({ ctx, input }) => {
      const table = await ctx.db.table.findUnique({
        where: { id: input.tableId },
        include: {
          columns: { orderBy: { order: "asc" } },
        },
      })

      if (!table) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `No table with id '${input.tableId}'`,
        })
      }
      return table
    }),

    getTablesByBase: protectedProcedure
    .input(z.object({ baseId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.table.findMany({
        where: { baseId: input.baseId },
        orderBy: { createdAt: 'asc' },
      });
    }),


})