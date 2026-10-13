import { postRouter } from "~/server/api/routers/post";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";
import { rowRouter } from "./routers/row";
import { tableRouter } from "./routers/table";
import { baseRouter } from "./routers/base";
import { columnRouter } from "./routers/column";
import { cellRouter } from "./routers/cell";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  post: postRouter,
  table: tableRouter,
  row: rowRouter,
  base: baseRouter,
  cell: cellRouter,
  column: columnRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const res = await trpc.post.all();
 *       ^? Post[]
 */
export const createCaller = createCallerFactory(appRouter);
