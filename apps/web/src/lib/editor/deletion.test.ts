import { describe, expect, it } from "vitest";
import { DELETE_FAILED_MESSAGE, deletePrompt } from "./deletion";

describe("deletePrompt", () => {
  it("names the animation so the wrong one is never confirmed away", () => {
    expect(deletePrompt("Left ear wiggle").body).toContain("Left ear wiggle");
  });

  it("falls back to a generic noun for an unnamed animation", () => {
    expect(deletePrompt("").body).toContain("this animation");
    expect(deletePrompt("   ").body).toContain("this animation");
  });

  it("says it cannot be undone, since there is no trash", () => {
    expect(deletePrompt("x").body).toContain("cannot be undone");
  });

  it("reassures that remixes are unaffected", () => {
    expect(deletePrompt("x").body).toMatch(/remix/i);
  });

  it("labels the button with the act", () => {
    expect(deletePrompt("x").confirmLabel).toBe("Delete");
  });

  it("has a retryable failure message", () => {
    expect(DELETE_FAILED_MESSAGE).toContain("try again");
  });
});
