import { describe, expect, it } from "vitest";
import { appRouter } from "../src/router.ts";
import { isOccConflict, withOccRetry } from "../src/occ.ts";
import { makeContext, validPayload } from "./helpers.ts";

const SUB = "11111111-1111-4111-8111-111111111111";

function occError(): Error & { code: string } {
  // Prisma surfaces DSQL OCC conflicts as P2034 (write conflict); the raw
  // driver surfaces pg serialization_failure 40001.
  return Object.assign(new Error("Transaction failed due to a write conflict"), {
    code: "P2034",
  });
}

describe("withOccRetry", () => {
  it("passes through the result when the first attempt succeeds", async () => {
    let attempts = 0;
    const result = await withOccRetry(async () => {
      attempts += 1;
      return "ok";
    });
    expect(result).toBe("ok");
    expect(attempts).toBe(1);
  });

  it("retries a P2034 write conflict and succeeds", async () => {
    let attempts = 0;
    const result = await withOccRetry(async () => {
      attempts += 1;
      if (attempts < 2) throw occError();
      return "ok";
    });
    expect(result).toBe("ok");
    expect(attempts).toBe(2);
  });

  it("retries a pg 40001 serialization failure", async () => {
    let attempts = 0;
    await withOccRetry(async () => {
      attempts += 1;
      if (attempts < 2) throw Object.assign(new Error("serialization failure"), { code: "40001" });
    });
    expect(attempts).toBe(2);
  });

  it("recognizes an OCC code nested in the error cause", () => {
    const err = new Error("query failed", {
      cause: Object.assign(new Error("conflict"), { code: "40001" }),
    });
    expect(isOccConflict(err)).toBe(true);
  });

  it("does not retry non-OCC errors", async () => {
    let attempts = 0;
    await expect(
      withOccRetry(async () => {
        attempts += 1;
        throw new Error("user not found");
      }),
    ).rejects.toThrow("user not found");
    expect(attempts).toBe(1);
  });

  it("gives up after exhausting attempts and rethrows the conflict", async () => {
    let attempts = 0;
    await expect(
      withOccRetry(async () => {
        attempts += 1;
        throw occError();
      }),
    ).rejects.toMatchObject({ code: "P2034" });
    expect(attempts).toBe(3);
  });
});

describe("write procedures retry OCC conflicts", () => {
  it("animations.create succeeds despite a transient write conflict", async () => {
    const ctx = makeContext({ sub: SUB });
    const realCreate = ctx.fake.animation.create;
    let failures = 1;
    Object.assign(ctx.fake.animation, {
      create: async (args: Parameters<typeof realCreate>[0]) => {
        if (failures > 0) {
          failures -= 1;
          throw occError();
        }
        return realCreate(args);
      },
    });
    const created = await appRouter.createCaller(ctx).animations.create({
      robotSlug: "robo-cat-ears",
      name: "Wiggle",
      payload: validPayload(),
    });
    expect(created.name).toBe("Wiggle");
    expect(ctx.fake.animations).toHaveLength(1);
  });
});
