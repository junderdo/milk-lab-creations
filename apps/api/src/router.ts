import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { Context } from "./context.ts";
import { withOccRetry } from "./occ.ts";
import {
  derivedScalars,
  packWireFormat,
  payloadSchemaFor,
  ROBOT_PROFILES,
  type AnimationPayload,
} from "./payload.ts";
import { authedProcedure, publicProcedure, router } from "./trpc.ts";

/** Per-user animation cap: blocks runaway clients, not real creative use. */
export const MAX_ANIMATIONS_PER_USER = 100;

/** Account deletion batch size — comfortably under DSQL's 3,000-row/10 MiB. */
const DELETE_BATCH_SIZE = 200;

const VISIBILITIES = ["private", "unlisted", "public"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

const nameSchema = z.string().trim().min(1).max(100);
const descriptionSchema = z.string().trim().max(1000);

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
        orderBy: { createdAt: "desc" },
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      });
      const nextCursor = items.length > input.limit ? items.pop()!.id : undefined;
      return { items, nextCursor };
    }),

  mine: authedProcedure.query(({ ctx }) =>
    ctx.db.animation.findMany({
      where: { ownerId: ctx.dbUser.id },
      select: animationListSelect,
      orderBy: { createdAt: "desc" },
    }),
  ),

  byId: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(({ ctx, input }) => getVisibleAnimation(ctx, input.id)),

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

      const count = await ctx.db.animation.count({ where: { ownerId: ctx.dbUser.id } });
      if (count >= MAX_ANIMATIONS_PER_USER) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `animation limit reached (${MAX_ANIMATIONS_PER_USER})`,
        });
      }

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

  update: authedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: nameSchema.optional(),
        description: descriptionSchema.nullable().optional(),
        payload: rawPayloadSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await getOwnedAnimation(ctx, ctx.dbUser.id, input.id);

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
