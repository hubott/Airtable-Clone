// src/server/trpc/router/base.ts
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";

export const baseRouter = createTRPCRouter({
  getUserBases: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const bases = await ctx.db.base.findMany({
      where: { user: { id: ctx.session.user.id} },
      select: { id: true, name: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    return bases;
  }),

  createBase: protectedProcedure
    .input(z.object({ name: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return await ctx.db.base.create({
        data: { name: input.name, user: { connect: { id: ctx.session.user.id } } },
      });
    }),
});
