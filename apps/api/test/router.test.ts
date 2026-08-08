import { describe, expect, it } from "vitest";
import { MAX_ANIMATIONS_PER_USER } from "../src/limits.ts";
import { packWireFormat, type AnimationPayload } from "../src/payload.ts";
import { appRouter, type Visibility } from "../src/router.ts";
import { makeAnimationRow, makeContext, ROBO_CAT_EARS, uuid, validPayload } from "./helpers.ts";

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

  it("asks the directory for the pool username, not the sub", async () => {
    // a Google-federated user is `google_<id>` in the pool, and AdminGetUser
    // does not answer for a sub at all — asking by sub fails every first
    // authed request, which reads to the client as "not signed in"
    let askedFor: string | null = null;
    const ctx = makeContext({
      sub: SUB,
      username: "google_112156352747254181745",
      fetchProfile: async (username) => {
        askedFor = username;
        return { email: "jeff@example.com", displayName: "Jeff" };
      },
    });

    await callerFor(ctx).users.me();
    expect(askedFor).toBe("google_112156352747254181745");
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
      ctx.fake.animations.push(makeAnimationRow({ ownerId: SUB, name: `a${i}` }));
    }
    await expect(
      caller.animations.create({
        robotSlug: "robo-cat-ears",
        name: "One too many",
        payload: validPayload(),
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("reports the count and the cap, counting a remix against the remixer", async () => {
    const ctx = makeContext({ sub: SUB });
    const theirs = await seedAnimation(makeContext({ db: ctx.fake, sub: OTHER_SUB }), {
      visibility: "public",
      name: "Theirs",
    });
    const caller = callerFor(ctx);

    // their animation is not mine, so the cap starts untouched
    expect(await caller.animations.quota()).toEqual({ count: 0, limit: MAX_ANIMATIONS_PER_USER });
    await caller.animations.remix({ id: theirs.id });
    expect(await caller.animations.quota()).toEqual({ count: 1, limit: MAX_ANIMATIONS_PER_USER });
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
    // cards draw sparklines from the payload, so browsing carries it
    expect(items[0]).toHaveProperty("payload");
    expect(items[0]).toMatchObject({
      name: "Public one",
      durationMs: 500,
      keyframeCount: 2,
      remixedFromId: null,
      owner: { displayName: "Jeff" },
      robot: { slug: "robo-cat-ears" },
    });
  });

  it("filters the gallery by robot slug", async () => {
    const ctx = makeContext({ sub: SUB });
    const caller = callerFor(ctx);
    await caller.users.me(); // provision so gallery rows carry an owner
    const catEars = await seedAnimation(ctx, { name: "Ears", visibility: "public" });

    const otherRobot = {
      id: uuid(),
      slug: "robo-dog-tail",
      name: "Robo Dog Tail",
      createdAt: new Date("2026-01-02"),
    };
    ctx.fake.robots.push(otherRobot);
    ctx.fake.animations.push(
      makeAnimationRow({
        ownerId: SUB,
        robotId: otherRobot.id,
        name: "Tail",
        visibility: "public",
      }),
    );

    const anon = callerFor(makeContext({ db: ctx.fake }));
    const filtered = await anon.animations.gallery({ robotSlug: "robo-cat-ears" });
    expect(filtered.items.map((i: { id: string }) => i.id)).toEqual([catEars.id]);
    const all = await anon.animations.gallery();
    expect(all.items).toHaveLength(2);
  });

  it("pages the gallery with a cursor", async () => {
    const ctx = makeContext({ sub: SUB });
    await callerFor(ctx).users.me();
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const id = uuid();
      ids.push(id);
      ctx.fake.animations.push(
        makeAnimationRow({
          id,
          ownerId: SUB,
          name: `page${i}`,
          visibility: "public",
          createdAt: new Date(2026, 0, 1 + i), // distinct: newest last-created
          updatedAt: new Date(2026, 0, 1 + i),
        }),
      );
    }

    const anon = callerFor(makeContext({ db: ctx.fake }));
    const first = await anon.animations.gallery({ limit: 2 });
    expect(first.items.map((i: { id: string }) => i.id)).toEqual([ids[2], ids[1]]);
    expect(first.nextCursor).toBe(ids[1]);

    const second = await anon.animations.gallery({ limit: 2, cursor: first.nextCursor });
    expect(second.items.map((i: { id: string }) => i.id)).toEqual([ids[0]]);
    expect(second.nextCursor).toBeUndefined();
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

describe("robots", () => {
  it("lists the robot catalog anonymously", async () => {
    const robots = await callerFor(makeContext()).robots.list();
    expect(robots).toEqual([ROBO_CAT_EARS]);
  });
});

describe("wire format", () => {
  it("serves the packed wire format for viewable animations", async () => {
    const ctx = makeContext({ sub: SUB });
    const anim = await seedAnimation(ctx, { visibility: "unlisted" });

    const anon = callerFor(makeContext({ db: ctx.fake }));
    const { wireBase64 } = await anon.animations.wireById({ id: anim.id });

    const bytes = Uint8Array.from(Buffer.from(wireBase64, "base64"));
    expect(bytes).toEqual(packWireFormat(validPayload() as AnimationPayload));
    expect(bytes[0]).toBe(2); // keyframe count leads the 1 + n*12 byte layout
    expect(bytes).toHaveLength(1 + 2 * 12);
  });

  it("gates the wire format behind the same visibility rules", async () => {
    const ctx = makeContext({ sub: SUB });
    const anim = await seedAnimation(ctx); // private
    const anon = callerFor(makeContext({ db: ctx.fake }));
    await expect(anon.animations.wireById({ id: anim.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(callerFor(ctx).animations.wireById({ id: anim.id })).resolves.toHaveProperty(
      "wireBase64",
    );
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

describe("conflict guard on animations.update", () => {
  /** A stale client's view of updatedAt: it saw the row one second ago. */
  const stale = (row: { updatedAt: Date }) => new Date(row.updatedAt.getTime() - 1000);

  it("rejects a stale expectedUpdatedAt with CONFLICT and writes nothing", async () => {
    const ctx = makeContext({ sub: SUB });
    const anim = await seedAnimation(ctx);

    await expect(
      callerFor(ctx).animations.update({
        id: anim.id,
        name: "Stale rename",
        expectedUpdatedAt: stale(anim),
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    expect(ctx.fake.animations[0]).toMatchObject({ name: "Wiggle", updatedAt: anim.updatedAt });
  });

  it("carries the current server record on the conflict, joined like byId", async () => {
    const ctx = makeContext({ sub: SUB });
    const anim = await seedAnimation(ctx);
    await callerFor(ctx).animations.update({ id: anim.id, name: "Renamed elsewhere" });
    const current = ctx.fake.animations[0]!;

    const error = await callerFor(ctx)
      .animations.update({ id: anim.id, name: "Mine", expectedUpdatedAt: stale(anim) })
      .then(
        () => undefined,
        (e: unknown) => e as { cause?: { current?: Record<string, unknown> } },
      );

    expect(error?.cause?.current).toMatchObject({
      id: anim.id,
      name: "Renamed elsewhere",
      updatedAt: current.updatedAt,
      payload: current.payload,
      owner: { displayName: "Jeff" },
      robot: { slug: "robo-cat-ears" },
    });
    // byId resolves remixedFrom, so the record the client swaps in must too
    expect(error?.cause?.current).toHaveProperty("remixedFrom", null);
  });

  it("carries the resolved remix source on the conflict record", async () => {
    const ctx = makeContext({ sub: SUB });
    const source = await seedAnimation(ctx, { name: "Original" });
    const fork = await callerFor(ctx).animations.remix({ id: source.id });
    await callerFor(ctx).animations.update({ id: fork.id, name: "Renamed elsewhere" });

    const error = await callerFor(ctx)
      .animations.update({ id: fork.id, name: "Mine", expectedUpdatedAt: stale(fork) })
      .then(
        () => undefined,
        (e: unknown) => e as { cause?: { current?: Record<string, unknown> } },
      );

    expect(error?.cause?.current).toMatchObject({
      remixedFromId: source.id,
      remixedFrom: { id: source.id, name: "Original" },
    });
  });

  it("lets a matching expectedUpdatedAt through", async () => {
    const ctx = makeContext({ sub: SUB });
    const anim = await seedAnimation(ctx);

    const updated = await callerFor(ctx).animations.update({
      id: anim.id,
      name: "Fresh rename",
      expectedUpdatedAt: anim.updatedAt,
    });
    expect(updated.name).toBe("Fresh rename");
  });

  it("preserves last-write-wins when expectedUpdatedAt is omitted", async () => {
    const ctx = makeContext({ sub: SUB });
    const anim = await seedAnimation(ctx);
    await callerFor(ctx).animations.update({ id: anim.id, name: "Someone else's edit" });

    const updated = await callerFor(ctx).animations.update({ id: anim.id, name: "Blind write" });
    expect(updated.name).toBe("Blind write");
  });

  it("checks ownership before the guard, so a stale non-owner still gets NOT_FOUND", async () => {
    const ctx = makeContext({ sub: SUB });
    const anim = await seedAnimation(ctx);
    const other = callerFor(makeContext({ db: ctx.fake, sub: OTHER_SUB }));

    await expect(
      other.animations.update({ id: anim.id, name: "Stolen", expectedUpdatedAt: stale(anim) }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects anonymous callers before the guard", async () => {
    const ctx = makeContext({ sub: SUB });
    const anim = await seedAnimation(ctx);

    await expect(
      callerFor(makeContext({ db: ctx.fake })).animations.update({
        id: anim.id,
        name: "Anon",
        expectedUpdatedAt: stale(anim),
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
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
      ctx.fake.animations.push(
        makeAnimationRow({ ownerId: SUB, name: `a${i}`, visibility: "public" }),
      );
    }
    const otherCtx = makeContext({ db: ctx.fake, sub: OTHER_SUB });
    const survivor = await seedAnimation(otherCtx, { name: "Survives" });

    await caller.users.deleteAccount();

    expect(ctx.fake.users.find((u) => u.id === SUB)).toBeUndefined();
    expect(ctx.fake.animations.map((a) => a.id)).toEqual([survivor.id]);
  });
});

describe("remix", () => {
  /** Source owned by someone else, at the given visibility. */
  async function foreignSource(ctx: ReturnType<typeof makeContext>, visibility: Visibility) {
    const otherCtx = makeContext({ db: ctx.fake, sub: OTHER_SUB });
    return seedAnimation(otherCtx, { name: "Theirs", visibility });
  }

  it("remixes any animation the caller can view", async () => {
    for (const visibility of ["public", "unlisted"] as const) {
      const ctx = makeContext({ sub: SUB });
      const source = await foreignSource(ctx, visibility);
      const fork = await callerFor(ctx).animations.remix({ id: source.id });
      expect(fork).toMatchObject({ ownerId: SUB, remixedFromId: source.id });
    }
  });

  it("remixes your own animation — duplicate is remix-of-self", async () => {
    const ctx = makeContext({ sub: SUB });
    const source = await seedAnimation(ctx); // private, owned by SUB
    const fork = await callerFor(ctx).animations.remix({ id: source.id });
    expect(fork).toMatchObject({ ownerId: SUB, remixedFromId: source.id });
  });

  it("refuses someone else's private animation without leaking existence", async () => {
    const ctx = makeContext({ sub: SUB });
    const source = await foreignSource(ctx, "private");
    await expect(callerFor(ctx).animations.remix({ id: source.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(ctx.fake.animations).toHaveLength(1); // no fork written
  });

  it("requires authentication", async () => {
    const ctx = makeContext({ sub: SUB });
    const source = await seedAnimation(ctx, { visibility: "public" });
    const anon = callerFor(makeContext({ db: ctx.fake }));
    await expect(anon.animations.remix({ id: source.id })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("forks a full private copy with default name and provenance", async () => {
    const ctx = makeContext({ sub: SUB });
    const otherCtx = makeContext({ db: ctx.fake, sub: OTHER_SUB });
    const source = await callerFor(otherCtx).animations.create({
      robotSlug: "robo-cat-ears",
      name: "Ear Wiggle",
      description: "Two quick flicks",
      payload: validPayload(3),
    });
    await callerFor(otherCtx).animations.setVisibility({
      id: source.id,
      visibility: "public",
    });

    const fork = await callerFor(ctx).animations.remix({ id: source.id });

    expect(fork).toMatchObject({
      ownerId: SUB,
      robotId: source.robotId,
      name: "Remix of Ear Wiggle",
      description: "Two quick flicks",
      visibility: "private", // never inherits the source's public visibility
      durationMs: source.durationMs,
      keyframeCount: source.keyframeCount,
      remixedFromId: source.id,
    });
    expect(fork.payload).toEqual(source.payload);
    expect(fork.id).not.toBe(source.id);
  });

  it("honors a caller-supplied name", async () => {
    const ctx = makeContext({ sub: SUB });
    const source = await seedAnimation(ctx, { visibility: "public" });
    const fork = await callerFor(ctx).animations.remix({ id: source.id, name: "My take" });
    expect(fork.name).toBe("My take");
  });

  it("keeps the default name inside the 100-char name limit", async () => {
    const ctx = makeContext({ sub: SUB });
    const source = await seedAnimation(ctx, { name: "N".repeat(100) });
    const fork = await callerFor(ctx).animations.remix({ id: source.id });
    expect(fork.name.length).toBeLessThanOrEqual(100);
    expect(fork.name.startsWith("Remix of NNN")).toBe(true);
  });

  it("truncates the default name on a character boundary, not mid-surrogate", async () => {
    const ctx = makeContext({ sub: SUB });
    // astral characters are two UTF-16 code units each, so a naive slice(0, 100)
    // lands mid-pair and yields a lone surrogate — invalid UTF-8 to Postgres
    const source = await seedAnimation(ctx, { name: "🐈".repeat(50) });
    const fork = await callerFor(ctx).animations.remix({ id: source.id });

    expect(fork.name).toBe(`Remix of ${"🐈".repeat(45)}`); // 9 + 45*2 = 99 units
    expect(Array.from(fork.name).at(-1)).toBe("🐈"); // a whole cat, not half of one
    expect(fork.name.length).toBeLessThanOrEqual(100);
  });

  it("enforces the per-user animation cap", async () => {
    const ctx = makeContext({ sub: SUB });
    const source = await foreignSource(ctx, "public");
    await callerFor(ctx).users.me();
    for (let i = 0; i < MAX_ANIMATIONS_PER_USER; i++) {
      ctx.fake.animations.push(makeAnimationRow({ ownerId: SUB }));
    }

    await expect(callerFor(ctx).animations.remix({ id: source.id })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("chains provenance to the immediate source when remixing a remix", async () => {
    const ctx = makeContext({ sub: SUB });
    const source = await seedAnimation(ctx, { visibility: "public" });
    const first = await callerFor(ctx).animations.remix({ id: source.id });
    const second = await callerFor(ctx).animations.remix({ id: first.id });
    expect(second.remixedFromId).toBe(first.id);
  });
});

describe("remix provenance on byId", () => {
  it("resolves remixedFrom when the source is viewable", async () => {
    const ctx = makeContext({ sub: SUB });
    const otherCtx = makeContext({ db: ctx.fake, sub: OTHER_SUB });
    const source = await seedAnimation(otherCtx, { name: "Theirs", visibility: "public" });
    const fork = await callerFor(ctx).animations.remix({ id: source.id });

    const read = await callerFor(ctx).animations.byId({ id: fork.id });
    expect(read.remixedFrom).toEqual({ id: source.id, name: "Theirs" });
  });

  it("returns a null remixedFrom for a non-remix", async () => {
    const ctx = makeContext({ sub: SUB });
    const anim = await seedAnimation(ctx);
    const read = await callerFor(ctx).animations.byId({ id: anim.id });
    expect(read.remixedFromId).toBeNull();
    expect(read.remixedFrom).toBeNull();
  });

  it("hides the source when it is no longer viewable, keeping remixedFromId", async () => {
    const ctx = makeContext({ sub: SUB });
    const otherCtx = makeContext({ db: ctx.fake, sub: OTHER_SUB });
    const source = await seedAnimation(otherCtx, { name: "Theirs", visibility: "public" });
    const fork = await callerFor(ctx).animations.remix({ id: source.id });

    await callerFor(otherCtx).animations.setVisibility({
      id: source.id,
      visibility: "private",
    });

    const read = await callerFor(ctx).animations.byId({ id: fork.id });
    expect(read.remixedFromId).toBe(source.id);
    expect(read.remixedFrom).toBeNull();
  });

  it("dangles harmlessly when the source is deleted", async () => {
    const ctx = makeContext({ sub: SUB });
    const otherCtx = makeContext({ db: ctx.fake, sub: OTHER_SUB });
    const source = await seedAnimation(otherCtx, { name: "Theirs", visibility: "public" });
    const fork = await callerFor(ctx).animations.remix({ id: source.id });

    await callerFor(otherCtx).animations.delete({ id: source.id });

    const read = await callerFor(ctx).animations.byId({ id: fork.id });
    expect(read.remixedFromId).toBe(source.id);
    expect(read.remixedFrom).toBeNull();
  });

  it("still resolves a private source for its own owner", async () => {
    const ctx = makeContext({ sub: SUB });
    const source = await seedAnimation(ctx, { name: "Mine" }); // private
    const fork = await callerFor(ctx).animations.remix({ id: source.id });

    const read = await callerFor(ctx).animations.byId({ id: fork.id });
    expect(read.remixedFrom).toEqual({ id: source.id, name: "Mine" });
  });
});
