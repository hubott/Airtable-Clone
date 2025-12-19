// src/server/trpc/router/row.ts
import { z } from "zod"
import { createTRPCRouter, protectedProcedure } from "../trpc"

export const rowRouter = createTRPCRouter({
  getRows: protectedProcedure
    .input(
      z.object({
        tableId: z.string(),
        cursor: z.string().nullish(), // for pagination
        take: z.number().min(1).max(1000).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.row.findMany({
        where: { tableId: input.tableId },
        take: input.take,
        skip: input.cursor ? 1 : 0,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        include: { cells: true },
        orderBy: { id: "asc" },
      })

      const nextCursor = rows.length === input.take ? rows[rows.length - 1]?.id ?? null : null

      return { rows, nextCursor }
    }),
})
