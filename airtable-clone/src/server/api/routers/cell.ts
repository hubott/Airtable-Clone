import { Prisma } from "~/../generated/prisma";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { parseCellValue } from "~/utils/cell-value";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";

function writeCell(
  tx: Prisma.TransactionClient,
  cell: { rowId: string; columnId: string },
  values: ReturnType<typeof parseCellValue>,
) {
  return tx.cell.upsert({
    where: { rowId_columnId: { rowId: cell.rowId, columnId: cell.columnId } },
    create: { rowId: cell.rowId, columnId: cell.columnId, ...values },
    update: values,
    select: { rowId: true, columnId: true, textValue: true, numberValue: true },
  });
}

export const cellRouter = createTRPCRouter({
  updateCells: protectedProcedure
    .input(
      z.object({
        tableId: z.string().min(1),
        cells: z
          .array(
            z.object({
              rowId: z.string().min(1),
              columnId: z.string().min(1),
              value: z.string().max(100_000),
            }),
          )
          .min(1)
          .max(1000),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      ctx.db.$transaction(
        async (tx) => {
          const tables = await tx.$queryRaw<{ id: string }[]>`
        SELECT t."id" FROM "Table" t JOIN "Base" b ON b."id"=t."baseId"
        WHERE t."id"=${input.tableId} AND b."ownerId"=${ctx.session.user.id}
        FOR SHARE OF t
      `;
          if (!tables.length)
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Table not found",
            });
          const keys = new Set(
            input.cells.map((cell) =>
              JSON.stringify([cell.rowId, cell.columnId]),
            ),
          );
          if (keys.size !== input.cells.length)
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Duplicate cells are not allowed",
            });
          const columnIds = [
            ...new Set(input.cells.map((cell) => cell.columnId)),
          ];
          const rowIds = [...new Set(input.cells.map((cell) => cell.rowId))];
          const columns = await tx.$queryRaw<
            { id: string; type: "TEXT" | "NUMBER" }[]
          >(Prisma.sql`
        SELECT "id", "type" FROM "Column" WHERE "tableId"=${input.tableId}
        AND "id" IN (${Prisma.join(columnIds)}) ORDER BY "id" FOR SHARE
      `);
          // Block row deletion without blocking foreign-key checks by other cell saves.
          const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT "id" FROM "Row" WHERE "tableId"=${input.tableId}
        AND "id" IN (${Prisma.join(rowIds)}) ORDER BY "id" FOR NO KEY UPDATE
      `);
          if (
            columns.length !== columnIds.length ||
            rows.length !== rowIds.length
          )
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Cells not found in this table",
            });
          const types = new Map(
            columns.map((column) => [column.id, column.type]),
          );
          const values = input.cells.map((cell) => {
            const type = types.get(cell.columnId);
            if (!type)
              throw new TRPCError({
                code: "NOT_FOUND",
                message: "Column not found",
              });
            try {
              return { ...cell, parsed: parseCellValue(type, cell.value) };
            } catch {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message:
                  "Paste contains an invalid number. No cells were changed.",
              });
            }
          });
          const saved = [];
          for (const cell of values) {
            saved.push(await writeCell(tx, cell, cell.parsed));
          }
          return saved;
        },
        { timeout: 20_000 },
      ),
    ),
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

        // Shared locks permit parallel saves while excluding type conversion/deletion.
        const columns = await tx.$queryRaw<{ type: "TEXT" | "NUMBER" }[]>`
          SELECT "type" FROM "Column"
          WHERE "id"=${input.columnId} AND "tableId"=${row.tableId}
          FOR SHARE
        `;
        const column = columns[0];
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

        return writeCell(tx, input, values);
      });
    }),
});
