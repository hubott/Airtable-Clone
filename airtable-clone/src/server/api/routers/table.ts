import { deleteTables } from "../delete-tables";
import { resourceName } from "../resource-name";
import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";

export const tableRouter = createTRPCRouter({
  deleteTable: protectedProcedure
    .input(z.object({ tableId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) =>
      ctx.db.$transaction(
        async (tx) => {
          const tables = await tx.$queryRaw<{ id: string; baseId: string }[]>`
      SELECT t."id",t."baseId" FROM "Table" t JOIN "Base" b ON b."id"=t."baseId"
      WHERE t."id"=${input.tableId} AND b."ownerId"=${ctx.session.user.id} FOR UPDATE OF t
    `;
          const table = tables[0];
          if (!table)
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Table not found",
            });
          await deleteTables(tx, [table.id]);
          return table;
        },
        { timeout: 120000 },
      ),
    ),

  renameTable: protectedProcedure
    .input(z.object({ tableId: z.string().min(1), name: resourceName }))
    .mutation(async ({ ctx, input }) => {
      const resources = await ctx.db.table.updateManyAndReturn({
        where: { id: input.tableId, base: { ownerId: ctx.session.user.id } },
        data: { name: input.name },
      });
      const resource = resources[0];
      if (!resource)
        throw new TRPCError({ code: "NOT_FOUND", message: "Table not found" });
      return resource;
    }),
  createTable: protectedProcedure
    .input(z.object({ baseId: z.string().min(1), name: resourceName }))
    .mutation(async ({ ctx, input }) =>
      ctx.db.$transaction(async (tx) => {
        const bases = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "Base" WHERE "id"=${input.baseId} AND "ownerId"=${ctx.session.user.id} FOR UPDATE
    `;
        if (!bases.length)
          throw new TRPCError({ code: "NOT_FOUND", message: "Base not found" });
        return tx.table.create({
          data: {
            baseId: input.baseId,
            name: input.name,
            columns: { create: { name: "Name", type: "TEXT", order: 0 } },
            rows: { create: { order: 0 } },
          },
        });
      }),
    ),
  getTableWithColumns: protectedProcedure
    .input(z.object({ tableId: z.string() }))
    .query(async ({ ctx, input }) => {
      const table = await ctx.db.table.findFirst({
        where: { id: input.tableId, base: { ownerId: ctx.session.user.id } },
        include: {
          columns: { orderBy: [{ order: "asc" }, { id: "asc" }] },
        },
      });

      if (!table) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `No table with id '${input.tableId}'`,
        });
      }
      return table;
    }),

  getTablesByBase: protectedProcedure
    .input(z.object({ baseId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.table.findMany({
        where: { baseId: input.baseId, base: { ownerId: ctx.session.user.id } },
        orderBy: { createdAt: "asc" },
      });
    }),
});
