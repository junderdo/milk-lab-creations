import { describe, expect, it } from "vitest";
import { appRouter, MAX_ANIMATIONS_PER_USER, type Visibility } from "../src/router.ts";
import { makeContext, uuid, validPayload } from "./helpers.ts";

const SUB = "11111111-1111-4111-8111-111111111111";
const OTHER_SUB = "22222222-2222-4222-8222-222222222222";

function callerFor(ctx: ReturnType<typeof makeContext>) {
  return appRouter.createCaller(ctx);
}

async function seedAnimation(
  ctx: ReturnType<typeof makeContext>,
  opts?: { visibility?: Visibility; name?: string },
) {
  const caller = callerFor(ctx);
  const created = await caller.animations.create({
    robotSlug: "robo-cat-ears",
    name: opts?.name ?? "Wiggle",
    payload: validPayload(),
  });
  if (opts?.visibility && opts.visibility !== "private") {
    await caller.animations.setVisibility({
      id: created.id,
      visibility: opts.visibility,
    });
  }
  return created;
}

describe("greet", () => {
  it("greets by name", async () => {
    const caller = callerFor(makeContext());
    const result = await caller.greet({ name: "Jeff" });
    expect(result.message).toBe("Hello Jeff, from the Milk Lab API");
  });
});

describe("auth & JIT provisioning", () => {
  it("rejects authed procedures for anonymous callers", async () => {
    const caller = callerFor(makeContext());
    await expect(caller.users.me()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("creates the users row from profile claims on first authed request", async () => {
    const ctx = makeContext({ sub: SUB });
    const me = await callerFor(ctx).users.me();
    expect(me).toMatchObject({ id: SUB, email: "jeff@example.com", displayName: "Jeff" });
    expect(ctx.fake.users).toHaveLength(1);
  });

  it("does not re-provision on later requests", async () => {
    const ctx = makeContext({
      sub: SUB,
      fetchProfile: async () => {
        throw new Error("should only be called once");
      },
    });
    ctx.fake.users.push({
      id: SUB,
      email: "jeff@example.com",
      displayName: "Existing",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const me = await callerFor(ctx).users.me();
    expect(me.displayName).toBe("Existing");
  });

  it("lets users edit their display name", async () => {
    const ctx = makeContext({ sub: SUB });
    const updated = await callerFor(ctx).users.updateDisplayName({ displayName: "Cat Herder" });
    expect(updated.displayName).toBe("Cat Herder");
  });
});

describe("payload validation", () => {
  const create = (payload: unknown) =>
    callerFor(makeContext({ sub: SUB })).animations.create({
      robotSlug: "robo-cat-ears",
      name: "Bad",
      payload: payload as { schemaVersion: number; keyframes: unknown[] },
    });

  it("accepts a valid payload and derives scalars", async () => {
    const ctx = makeContext({ sub: SUB });
    const created = await callerFor(ctx).animations.create({
      robotSlug: "robo-cat-ears",
      name: "Wiggle",
      payload: validPayload(3),
    });
    expect(created.durationMs).toBe(1000);
    expect(created.keyframeCount).toBe(3);
    expect(created.visibility).toBe("private");
  });

  it("rejects unknown schema versions", async () => {
    await expect(create({ ...validPayload(), schemaVersion: 2 })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("rejects zero and too many keyframes", async () => {
    await expect(create({ schemaVersion: 1, keyframes: [] })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(create(validPayload(65))).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects out-of-range angles, ease types, and times", async () => {
    const base = validPayload().keyframes[0];
    for (const kf of [
      { ...base, angles: [181, 0, 0, 0] },
      { ...base, angles: [90, 90, 90] }, // wrong channel count
      { ...base, easeInType: 4 },
      { ...base, timeMs: 70000 },
    ]) {
      await expect(create({ schemaVersion: 1, keyframes: [kf] })).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    }
  });

  it("rejects keyframe times that move backwards", async () => {
    const payload = validPayload(2);
    payload.keyframes[1]!.timeMs = 0;
    payload.keyframes[0]!.timeMs = 500;
    await expect(create(payload)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects unknown robots", async () => {
    await expect(
      callerFor(makeContext({ sub: SUB })).animations.create({
        robotSlug: "robo-dog-tail",
        name: "Wag",
        payload: validPayload(),
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("surfaces a vanished robot row on update as an internal error", async () => {
    const ctx = makeContext({ sub: SUB });
    const anim = await seedAnimation(ctx);
    ctx.fake.robots = [];
    await expect(
      callerFor(ctx).animations.update({ id: anim.id, payload: validPayload() }),
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });
});

describe("quota", () => {
  it("blocks creation at the per-user cap", async () => {
    const ctx = makeContext({ sub: SUB });
    const caller = callerFor(ctx);
    await caller.users.me(); // provision
    for (let i = 0; i < MAX_ANIMATIONS_PER_USER; i++) {
      ctx.fake.animations.push({
        id: uuid(),
        ownerId: SUB,
        robotId: ctx.fake.robots[0]!.id,
        name: `a${i}`,
        description: null,
        visibility: "private",
        payload: validPayload(),
        durationMs: 500,
        keyframeCount: 2,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    await expect(
      caller.animations.create({
        robotSlug: "robo-cat-ears",
        name: "One too many",
        payload: validPayload(),
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("visibility", () => {
  it("hides private animations from everyone but the owner", async () => {
    const ctx = makeContext({ sub: SUB });
    const created = await seedAnimation(ctx);

    await expect(callerFor(ctx).animations.byId({ id: created.id })).resolves.toMatchObject({
      id: created.id,
    });

    const anonCtx = makeContext({ db: ctx.fake });
    await expect(callerFor(anonCtx).animations.byId({ id: created.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });

    const otherCtx = makeContext({ db: ctx.fake, sub: OTHER_SUB });
    await expect(callerFor(otherCtx).animations.byId({ id: created.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("serves unlisted and public animations to anonymous viewers", async () => {
    const ctx = makeContext({ sub: SUB });
    const unlisted = await seedAnimation(ctx, { visibility: "unlisted" });
    const anon = callerFor(makeContext({ db: ctx.fake }));
    await expect(anon.animations.byId({ id: unlisted.id })).resolves.toMatchObject({
      id: unlisted.id,
    });
  });

  it("only lists public animations in the gallery", async () => {
    const ctx = makeContext({ sub: SUB });
    await seedAnimation(ctx, { name: "Private one" });
    await seedAnimation(ctx, { name: "Unlisted one", visibility: "unlisted" });
    const pub = await seedAnimation(ctx, { name: "Public one", visibility: "public" });

    const { items } = await callerFor(makeContext({ db: ctx.fake })).animations.gallery();
    expect(items.map((i: { id: string }) => i.id)).toEqual([pub.id]);
  });

  it("revocation: flipping public back to private kills anonymous access", async () => {
    const ctx = makeContext({ sub: SUB });
    const anim = await seedAnimation(ctx, { visibility: "public" });
    await callerFor(ctx).animations.setVisibility({ id: anim.id, visibility: "private" });
    const anon = callerFor(makeContext({ db: ctx.fake }));
    await expect(anon.animations.byId({ id: anim.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("ownership", () => {
  it("blocks mutations on animations you do not own without leaking existence", async () => {
    const ctx = makeContext({ sub: SUB });
    const anim = await seedAnimation(ctx);
    const other = callerFor(makeContext({ db: ctx.fake, sub: OTHER_SUB }));

    await expect(other.animations.delete({ id: anim.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      other.animations.setVisibility({ id: anim.id, visibility: "public" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(other.animations.update({ id: anim.id, name: "Stolen" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("mine returns all visibilities for the owner only", async () => {
    const ctx = makeContext({ sub: SUB });
    await seedAnimation(ctx);
    await seedAnimation(ctx, { visibility: "public" });

    const otherCtx = makeContext({ db: ctx.fake, sub: OTHER_SUB });
    await seedAnimation(otherCtx, { name: "Someone else's" });

    const mine = await callerFor(ctx).animations.mine();
    expect(mine).toHaveLength(2);
  });
});

describe("deletion", () => {
  it("deletes a single animation", async () => {
    const ctx = makeContext({ sub: SUB });
    const anim = await seedAnimation(ctx);
    await callerFor(ctx).animations.delete({ id: anim.id });
    expect(ctx.fake.animations).toHaveLength(0);
  });

  it("account deletion removes the user and every animation in batches", async () => {
    const ctx = makeContext({ sub: SUB });
    const caller = callerFor(ctx);
    await caller.users.me();
    // more rows than one delete batch to prove the loop drains fully
    for (let i = 0; i < 450; i++) {
      ctx.fake.animations.push({
        id: uuid(),
        ownerId: SUB,
        robotId: ctx.fake.robots[0]!.id,
        name: `a${i}`,
        description: null,
        visibility: "public",
        payload: validPayload(),
        durationMs: 500,
        keyframeCount: 2,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    const otherCtx = makeContext({ db: ctx.fake, sub: OTHER_SUB });
    const survivor = await seedAnimation(otherCtx, { name: "Survives" });

    await caller.users.deleteAccount();

    expect(ctx.fake.users.find((u) => u.id === SUB)).toBeUndefined();
    expect(ctx.fake.animations.map((a) => a.id)).toEqual([survivor.id]);
  });
});
