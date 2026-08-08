import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { Context } from "./context.ts";
import { withOccRetry } from "./occ.ts";

/**
 * Attached as the `cause` of a CONFLICT error when a guarded write loses a
 * lost-update race. `current` is the server's record as of the rejection; the
 * errorFormatter lifts it onto the wire so the client can adopt it (or decide
 * to overwrite) without a second round-trip.
 */
export class StaleWriteError extends Error {
  // Declared and assigned rather than a `readonly` constructor parameter
  // property: `dev:server` runs under node's --experimental-strip-types, which
  // erases types without emitting code and so cannot support that sugar.
  readonly current: unknown;

  constructor(current: unknown) {
    super("record was changed elsewhere");
    this.name = "StaleWriteError";
    this.current = current;
  }
}

// transformer must match the httpBatchLink transformer on every client
const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter: ({ shape, error }) =>
    error.cause instanceof StaleWriteError
      ? { ...shape, data: { ...shape.data, current: error.cause.current } }
      : shape,
});

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
    const profile = await ctx.fetchProfile(ctx.user.username);
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
