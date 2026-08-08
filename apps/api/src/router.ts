import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { Context } from "./context.ts";
import { withOccRetry } from "./occ.ts";
import { DESCRIPTION_MAX, MAX_ANIMATIONS_PER_USER, NAME_MAX } from "./limits.ts";
import {
  derivedScalars,
  packWireFormat,
  payloadSchemaFor,
  ROBOT_PROFILES,
  type AnimationPayload,
} from "./payload.ts";
import { authedProcedure, publicProcedure, router, StaleWriteError } from "./trpc.ts";

/** Account deletion batch size — comfortably under DSQL's 3,000-row/10 MiB. */
const DELETE_BATCH_SIZE = 200;

const VISIBILITIES = ["private", "unlisted", "public"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

const nameSchema = z.string().trim().min(1).max(NAME_MAX);
const descriptionSchema = z.string().trim().max(DESCRIPTION_MAX);

/**
 * "Remix of ⟨source⟩", truncated so a maxed-out source name still fits.
 *
 * Truncation walks code points rather than slicing code units: a bare
 * `.slice(0, NAME_MAX)` can cut an astral character (emoji, and most non-Latin
 * scripts beyond the BMP) in half, and the resulting lone surrogate is invalid
 * UTF-8 that the database rejects — turning a legitimate remix into a 500.
 * The budget is still counted in UTF-16 code units, matching `nameSchema`.
 */
function defaultRemixName(sourceName: string): string {
  const full = `Remix of ${sourceName}`;
  if (full.length <= NAME_MAX) return full;
  let truncated = "";
  for (const char of full) {
    if (truncated.length + char.length > NAME_MAX) break;
    truncated += char;
  }
  return truncated;
}

// Unvalidated shape accepted at the boundary; real validation is per-robot.
const rawPayloadSchema = z.object({
  schemaVersion: z.number(),
  keyframes: z.array(z.unknown()),
});

function validatePayload(robotSlug: string, payload: unknown): AnimationPayload {
  const profile = ROBOT_PROFILES[robotSlug];
  if (!profile) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `no validation profile for robot "${robotSlug}"`,
    });
  }
  const result = payloadSchemaFor(profile).safeParse(payload);
  if (!result.success) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `invalid animation payload: ${result.error.issues[0]?.message ?? "malformed"}`,
    });
  }
  return result.data;
}

const ownerRobotSelect = {
  owner: { select: { id: true, displayName: true } },
  robot: { select: { slug: true, name: true } },
} as const;

const animationListSelect = {
  id: true,
  name: true,
  description: true,
  visibility: true,
  durationMs: true,
  keyframeCount: true,
  // cards draw their sparkline from the payload, so lists carry it: ≤64 keyframes
  // and a 32 KB ceiling per row (`payload.ts`), which a page of cards absorbs
  payload: true,
  remixedFromId: true, // cards show a remix badge; the source itself is not resolved here
  createdAt: true,
  updatedAt: true,
  ...ownerRobotSelect,
} as const;

/** Reads return NOT_FOUND (not FORBIDDEN) so private ids don't leak existence. */
async function getVisibleAnimation(ctx: Context, id: string) {
  const animation = await ctx.db.animation.findUnique({
    where: { id },
    include: ownerRobotSelect,
  });
  if (!animation) throw new TRPCError({ code: "NOT_FOUND" });
  if (animation.visibility === "private" && animation.ownerId !== ctx.user?.sub) {
    throw new TRPCError({ code: "NOT_FOUND" });
  }
  return animation;
}

/**
 * A viewable animation plus its remix source as `remixedFrom` — null when there
 * is none, when the source row is gone (the column is allowed to dangle — no
 * FK), or when the caller cannot view it. `remixedFromId` stays on the record
 * either way, so the client can tell "not a remix" from "remixed from something
 * you can't see". Every caller that returns a full animation record uses this,
 * so the shape stays uniform by construction rather than by convention.
 */
async function getVisibleAnimationWithSource(ctx: Context, id: string) {
  const animation = await getVisibleAnimation(ctx, id);
  if (animation.remixedFromId === null) return { ...animation, remixedFrom: null };
  const source = await ctx.db.animation.findUnique({
    where: { id: animation.remixedFromId },
    select: { id: true, name: true, visibility: true, ownerId: true },
  });
  const viewable =
    source !== null && (source.visibility !== "private" || source.ownerId === ctx.user?.sub);
  return {
    ...animation,
    remixedFrom: viewable ? { id: source.id, name: source.name } : null,
  };
}

const ownedAnimationCount = (ctx: Context, ownerId: string) =>
  ctx.db.animation.count({ where: { ownerId } });

/**
 * Blocks runaway clients on every path that creates an animation.
 *
 * The cap is this API's only FORBIDDEN — reads hide behind NOT_FOUND so private
 * ids don't leak — which is what lets the client recognise it by code alone
 * rather than by matching on the message.
 */
async function assertUnderAnimationCap(ctx: Context, ownerId: string) {
  if ((await ownedAnimationCount(ctx, ownerId)) >= MAX_ANIMATIONS_PER_USER) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `animation limit reached (${MAX_ANIMATIONS_PER_USER})`,
    });
  }
}

async function getOwnedAnimation(ctx: Context, ownerId: string, id: string) {
  const animation = await ctx.db.animation.findUnique({ where: { id } });
  if (!animation || animation.ownerId !== ownerId) {
    throw new TRPCError({ code: "NOT_FOUND" });
  }
  return animation;
}

const usersRouter = router({
  me: authedProcedure.query(({ ctx }) => ctx.dbUser),

  updateDisplayName: authedProcedure
    .input(z.object({ displayName: nameSchema }))
    .mutation(({ ctx, input }) =>
      withOccRetry(() =>
        ctx.db.user.update({
          where: { id: ctx.dbUser.id },
          data: { displayName: input.displayName },
        }),
      ),
    ),

  deleteAccount: authedProcedure.mutation(async ({ ctx }) => {
    // no FK cascades in DSQL: delete animations in batches, then the user
    for (;;) {
      const batch = await ctx.db.animation.findMany({
        where: { ownerId: ctx.dbUser.id },
        select: { id: true },
        take: DELETE_BATCH_SIZE,
      });
      if (batch.length === 0) break;
      await withOccRetry(() =>
        ctx.db.animation.deleteMany({
          where: { id: { in: batch.map((a) => a.id) } },
        }),
      );
    }
    await withOccRetry(() => ctx.db.user.delete({ where: { id: ctx.dbUser.id } }));
    return { deleted: true };
  }),
});

const robotsRouter = router({
  list: publicProcedure.query(({ ctx }) =>
    ctx.db.robot.findMany({ orderBy: { createdAt: "asc" } }),
  ),
});

const animationsRouter = router({
  gallery: publicProcedure
    .input(
      z
        .object({
          robotSlug: z.string().optional(),
          cursor: z.string().uuid().optional(),
          limit: z.number().int().min(1).max(100).default(50),
        })
        .default({ limit: 50 }),
    )
    .query(async ({ ctx, input }) => {
      const items = await ctx.db.animation.findMany({
        where: {
          visibility: "public",
          ...(input.robotSlug ? { robot: { slug: input.robotSlug } } : {}),
        },
        select: animationListSelect,
        // id tiebreaker: createdAt ties would otherwise make cursor resumption
        // nondeterministic (rows skipped or repeated across pages)
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      });
      // cursor + skip:1 resumes *after* the cursor row, so it must be the last
      // row we return — anchoring on the popped row would drop it entirely
      let nextCursor: string | undefined;
      if (items.length > input.limit) {
        items.pop();
        nextCursor = items[items.length - 1]!.id;
      }
      return { items, nextCursor };
    }),

  mine: authedProcedure.query(({ ctx }) =>
    ctx.db.animation.findMany({
      where: { ownerId: ctx.dbUser.id },
      select: animationListSelect,
      orderBy: { createdAt: "desc" },
    }),
  ),

  /**
   * How much of the cap is used — so a page can disable "New animation" and
   * "Remix" rather than let a user author something the save will refuse.
   * `/my` has the count already in its list and does not need this.
   */
  quota: authedProcedure.query(async ({ ctx }) => ({
    count: await ownedAnimationCount(ctx, ctx.dbUser.id),
    limit: MAX_ANIMATIONS_PER_USER,
  })),

  byId: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(({ ctx, input }) => getVisibleAnimationWithSource(ctx, input.id)),

  /** The firmware wire format, base64 — what a device actually plays. */
  wireById: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const animation = await getVisibleAnimation(ctx, input.id);
      const payload = animation.payload as unknown as AnimationPayload;
      return {
        wireBase64: Buffer.from(packWireFormat(payload)).toString("base64"),
      };
    }),

  create: authedProcedure
    .input(
      z.object({
        robotSlug: z.string(),
        name: nameSchema,
        description: descriptionSchema.optional(),
        payload: rawPayloadSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const robot = await ctx.db.robot.findUnique({ where: { slug: input.robotSlug } });
      if (!robot) throw new TRPCError({ code: "NOT_FOUND", message: "unknown robot" });

      const payload = validatePayload(robot.slug, input.payload);
      await assertUnderAnimationCap(ctx, ctx.dbUser.id);

      return withOccRetry(() =>
        ctx.db.animation.create({
          data: {
            ownerId: ctx.dbUser.id,
            robotId: robot.id,
            name: input.name,
            description: input.description,
            payload,
            ...derivedScalars(payload),
          },
        }),
      );
    }),

  /**
   * Fork any animation the caller can view into a private copy of their own.
   * Viewable = remixable, so remixing your own animation doubles as duplicate.
   * The copy happens server-side: the payload never round-trips the client, and
   * `remixedFromId` is taken from the source row rather than the input, so
   * provenance cannot be forged.
   */
  remix: authedProcedure
    .input(z.object({ id: z.string().uuid(), name: nameSchema.optional() }))
    .mutation(async ({ ctx, input }) => {
      // NOT_FOUND for anything the caller cannot view — same rule as byId
      const source = await getVisibleAnimation(ctx, input.id);
      await assertUnderAnimationCap(ctx, ctx.dbUser.id);

      const payload = source.payload as unknown as AnimationPayload;
      return withOccRetry(() =>
        ctx.db.animation.create({
          data: {
            ownerId: ctx.dbUser.id,
            robotId: source.robotId,
            // a maxed-out source name would push the default past the 100-char
            // limit, so clamp rather than reject a legitimate remix
            name: input.name ?? defaultRemixName(source.name),
            description: source.description,
            payload,
            ...derivedScalars(payload),
            visibility: "private", // publishing a fork is always a fresh decision
            remixedFromId: source.id,
          },
        }),
      );
    }),

  update: authedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        // The caller's last-known updatedAt. Omitted → last-write-wins, so
        // callers that never read one back are unaffected.
        expectedUpdatedAt: z.date().optional(),
        name: nameSchema.optional(),
        description: descriptionSchema.nullable().optional(),
        payload: rawPayloadSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await getOwnedAnimation(ctx, ctx.dbUser.id, input.id);

      // Lost-update detection, distinct from occ.ts's serialization retry.
      // Deliberately a read-compare-write rather than an updatedAt predicate on
      // the write: @updatedAt is written at millisecond precision into a
      // microsecond column, so an equality predicate is not reliably
      // round-trippable. The residual window between this check and the write
      // is the price; the blast radius is one person in two tabs.
      if (
        input.expectedUpdatedAt !== undefined &&
        existing.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()
      ) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "animation was changed elsewhere",
          // full record, joined the same way byId returns it, so the client can
          // swap it in wholesale
          cause: new StaleWriteError(await getVisibleAnimationWithSource(ctx, input.id)),
        });
      }

      let payloadData = {};
      if (input.payload !== undefined) {
        const robot = await ctx.db.robot.findUnique({ where: { id: existing.robotId } });
        if (!robot) {
          // integrity lives in procedures (no FKs): a missing robot row for a
          // stored animation is our invariant breach, not a caller mistake
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "animation references a robot that no longer exists",
          });
        }
        const payload = validatePayload(robot.slug, input.payload);
        payloadData = { payload, ...derivedScalars(payload) };
      }

      return withOccRetry(() =>
        ctx.db.animation.update({
          where: { id: existing.id },
          data: {
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.description !== undefined ? { description: input.description } : {}),
            ...payloadData,
          },
        }),
      );
    }),

  setVisibility: authedProcedure
    .input(z.object({ id: z.string().uuid(), visibility: z.enum(VISIBILITIES) }))
    .mutation(async ({ ctx, input }) => {
      const existing = await getOwnedAnimation(ctx, ctx.dbUser.id, input.id);
      return withOccRetry(() =>
        ctx.db.animation.update({
          where: { id: existing.id },
          data: { visibility: input.visibility },
        }),
      );
    }),

  delete: authedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await getOwnedAnimation(ctx, ctx.dbUser.id, input.id);
      await withOccRetry(() => ctx.db.animation.delete({ where: { id: existing.id } }));
      return { deleted: true };
    }),
});

export const appRouter = router({
  greet: publicProcedure.input(z.object({ name: z.string() })).query(({ input }) => ({
    message: `Hello ${input.name}, from the Milk Lab API`,
    at: new Date(),
  })),
  users: usersRouter,
  robots: robotsRouter,
  animations: animationsRouter,
});

export type AppRouter = typeof appRouter;
