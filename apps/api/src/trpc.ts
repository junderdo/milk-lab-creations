import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { Context } from "./context.ts";
import { withOccRetry } from "./occ.ts";

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

  const sub = ctx.user.sub;
  let dbUser = await ctx.db.user.findUnique({ where: { id: sub } });
  if (!dbUser) {
    const profile = await ctx.fetchProfile(sub);
    dbUser = await withOccRetry(() =>
      ctx.db.user.upsert({
        where: { id: sub },
        create: {
          id: sub,
          email: profile.email,
          displayName: profile.displayName,
        },
        update: {},
      }),
    );
  }

  return next({ ctx: { ...ctx, dbUser } });
});
