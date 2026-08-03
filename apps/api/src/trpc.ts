import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { Context } from "./context.ts";

// transformer must match the httpBatchLink transformer on every client
const t = initTRPC.context<Context>().create({ transformer: superjson });

export const router = t.router;
export const publicProcedure = t.procedure;

/**
 * Authenticated procedures also JIT-provision the users row on first request:
 * users.id = Cognito sub, email/name seeded from profile claims.
 */
export const authedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });

  let dbUser = await ctx.db.user.findUnique({ where: { id: ctx.user.sub } });
  if (!dbUser) {
    const profile = await ctx.fetchProfile(ctx.user.sub);
    dbUser = await ctx.db.user.upsert({
      where: { id: ctx.user.sub },
      create: {
        id: ctx.user.sub,
        email: profile.email,
        displayName: profile.displayName,
      },
      update: {},
    });
  }

  return next({ ctx: { ...ctx, dbUser } });
});
