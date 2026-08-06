// createCaller bypasses the errorFormatter, so the one thing that makes the
// conflict guard useful to a browser client — the current record surviving the
// trip over the wire — is exercised through the real fetch adapter here.
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import superjson from "superjson";
import { describe, expect, it } from "vitest";
import { appRouter } from "../src/router.ts";
import { makeContext, validPayload } from "./helpers.ts";

const SUB = "11111111-1111-4111-8111-111111111111";

async function post(ctx: ReturnType<typeof makeContext>, path: string, input: unknown) {
  const res = await fetchRequestHandler({
    endpoint: "/trpc",
    router: appRouter,
    createContext: () => ctx,
    req: new Request(`http://api.test/trpc/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(superjson.serialize(input)),
    }),
  });
  const body = (await res.json()) as { error?: unknown; result?: unknown };
  return { status: res.status, body };
}

describe("conflict error over the wire", () => {
  it("delivers the current record, dates intact, on a 409", async () => {
    const ctx = makeContext({ sub: SUB });
    const caller = appRouter.createCaller(ctx);
    const anim = await caller.animations.create({
      robotSlug: "robo-cat-ears",
      name: "Wiggle",
      payload: validPayload(),
    });
    await caller.animations.update({ id: anim.id, name: "Renamed elsewhere" });

    const { status, body } = await post(ctx, "animations.update", {
      id: anim.id,
      name: "Mine",
      expectedUpdatedAt: new Date(anim.updatedAt.getTime() - 1000),
    });

    expect(status).toBe(409);
    const error = superjson.deserialize(body.error as never) as {
      data: { code: string; current: { id: string; name: string; updatedAt: Date } };
    };
    expect(error.data.code).toBe("CONFLICT");
    expect(error.data.current).toMatchObject({ id: anim.id, name: "Renamed elsewhere" });
    expect(error.data.current.updatedAt).toBeInstanceOf(Date);
  });

  it("leaves ordinary errors' shape alone", async () => {
    const ctx = makeContext({ sub: SUB });
    const { status, body } = await post(ctx, "animations.update", {
      id: "00000000-0000-4000-8000-00000000dead",
      name: "Nope",
    });

    expect(status).toBe(404);
    const error = superjson.deserialize(body.error as never) as { data: Record<string, unknown> };
    expect(error.data.code).toBe("NOT_FOUND");
    expect(error.data).not.toHaveProperty("current");
  });
});
