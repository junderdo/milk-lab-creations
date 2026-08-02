import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import { z } from "zod";

// transformer must match the httpBatchLink transformer on every client
const t = initTRPC.create({ transformer: superjson });

export const appRouter = t.router({
  greet: t.procedure.input(z.object({ name: z.string() })).query(({ input }) => ({
    message: `Hello ${input.name}, from the Milk Lab API`,
    at: new Date(),
  })),
});

export type AppRouter = typeof appRouter;
