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
  cursor: input.cursor ? { id: input.cursor } : undefined,
  skip: input.cursor ? 1 : 0,
  orderBy: [
    { order: "asc" },
    { id: "asc" } // ensures stable ordering
  ],
})



const rowIds = rows.map((r) => r.id)
const cells = await ctx.db.cell.findMany({
  where: { rowId: { in: rowIds } },
  select: {
    rowId: true,
    columnId: true,
    textValue: true,
    numberValue: true,
  },
})



      const formattedRows = rows.map((row) => ({
  ...row,
  cellsByColumnId: Object.fromEntries(
    cells.filter((c) => c.rowId === row.id).map((c) => [c.columnId, c])
  ),
}))
const nextCursor =
  formattedRows.length < input.take
    ? null
    : formattedRows[formattedRows.length - 1]?.id ?? null


return { formattedRows: formattedRows ?? [], nextCursor }



      console.log("Fetched rows:", rows.length, "Next cursor:", nextCursor)
      return { formattedRows, nextCursor }
    }),
})
