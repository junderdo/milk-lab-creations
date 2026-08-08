import { describe, expect, it } from "vitest";
import { ANIMATION_LIMIT, atAnimationCap, isAnimationCapError, nearAnimationCap } from "./quota";

describe("atAnimationCap", () => {
  it("blocks at the limit, not one past it", () => {
    expect(atAnimationCap(ANIMATION_LIMIT - 1)).toBe(false);
    expect(atAnimationCap(ANIMATION_LIMIT)).toBe(true);
  });

  it("still blocks a count that somehow got past the limit", () => {
    // the cap can be lowered under users who are already over it
    expect(atAnimationCap(ANIMATION_LIMIT + 5)).toBe(true);
  });
});

describe("nearAnimationCap", () => {
  it("warns before it blocks", () => {
    expect(nearAnimationCap(ANIMATION_LIMIT - 4)).toBe(false);
    expect(nearAnimationCap(ANIMATION_LIMIT - 3)).toBe(true);
  });
});

describe("isAnimationCapError", () => {
  it("recognises the rejection by its code", () => {
    expect(
      isAnimationCapError({ message: "animation limit reached (30)", data: { code: "FORBIDDEN" } }),
    ).toBe(true);
  });

  it("leaves every other failure alone", () => {
    expect(isAnimationCapError({ data: { code: "CONFLICT" } })).toBe(false);
    expect(isAnimationCapError({ data: { code: "UNAUTHORIZED" } })).toBe(false);
    expect(isAnimationCapError({ message: "animation limit reached (30)" })).toBe(false);
  });

  it("survives a thrown value that is not an error object", () => {
    expect(isAnimationCapError("boom")).toBe(false);
    expect(isAnimationCapError(null)).toBe(false);
    expect(isAnimationCapError(undefined)).toBe(false);
  });
});
