import { describe, expect, it } from "vitest";
import { VISIBILITY_OPTIONS, visibilityOf, visibilityPrompt } from "./visibility";

describe("visibilityOf", () => {
  it("accepts the three the API accepts", () => {
    expect(VISIBILITY_OPTIONS.map((option) => option.value)).toEqual([
      "private",
      "unlisted",
      "public",
    ]);
    for (const option of VISIBILITY_OPTIONS) {
      expect(visibilityOf(option.value)).toBe(option.value);
    }
  });

  it("rejects anything else rather than guessing", () => {
    expect(visibilityOf("secret")).toBeNull();
    expect(visibilityOf("")).toBeNull();
  });
});

describe("visibilityPrompt", () => {
  it("names the act, not the setting, in the button that does it", () => {
    expect(visibilityPrompt("public").confirmLabel).toBe("Publish");
    expect(visibilityPrompt("unlisted").confirmLabel).toBe("Share by link");
    expect(visibilityPrompt("private").confirmLabel).toBe("Make private");
  });

  it("says every change is immediate, since Save does not carry it", () => {
    for (const option of VISIBILITY_OPTIONS) {
      expect(visibilityPrompt(option.value).body).toContain("immediately");
    }
  });

  it("warns that going private breaks links people already have", () => {
    expect(visibilityPrompt("private").body).toContain("link");
  });
});
