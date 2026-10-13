// src/server/trpc/router/base.ts
import { TRPCError } from "@trpc/server";
import { resourceName } from "../resource-name";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";

export const baseRouter = createTRPCRouter({
  getBase: protectedProcedure
    .input(z.object({ baseId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const base = await ctx.db.base.findFirst({
        where: { id: input.baseId, ownerId: ctx.session.user.id },
        select: { id: true, name: true, createdAt: true },
      });
      if (!base)
        throw new TRPCError({ code: "NOT_FOUND", message: "Base not found" });
      return base;
    }),
  getUserBases: protectedProcedure.query(async ({ ctx }) => {
    const bases = await ctx.db.base.findMany({
      where: { user: { id: ctx.session.user.id } },
      select: { id: true, name: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    return bases;
  }),

  createBase: protectedProcedure
    .input(z.object({ name: resourceName }))
    .mutation(async ({ ctx, input }) => {
      return await ctx.db.base.create({
        data: {
          name: input.name,
          user: { connect: { id: ctx.session.user.id } },
        },
      });
    }),
});
