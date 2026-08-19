import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AVATAR_PRESETS, avatarOf, presetOf } from "./avatar";

const USER = "11111111-1111-4111-8111-111111111111";

describe("presetOf", () => {
  it("reads the tokens the server writes", () => {
    for (const preset of AVATAR_PRESETS) {
      expect(presetOf(`preset:${preset}`)).toBe(preset);
    }
  });

  it("returns null for anything else rather than guessing", () => {
    expect(presetOf("cat-01")).toBeNull(); // bare key: not a token
    expect(presetOf("preset:cat-99")).toBeNull();
    expect(presetOf("upload:abc123")).toBeNull(); // a variant this build predates
    expect(presetOf("")).toBeNull();
  });
});

describe("avatarOf", () => {
  it("uses the stored preset when there is one", () => {
    expect(avatarOf("preset:cat-05", USER)).toBe("cat-05");
  });

  it("falls back to the id for a user who has never chosen", () => {
    expect(AVATAR_PRESETS).toContain(avatarOf(null, USER));
  });

  it("gives the same user the same face every time", () => {
    expect(avatarOf(null, USER)).toBe(avatarOf(null, USER));
    expect(avatarOf(undefined, USER)).toBe(avatarOf(null, USER));
  });

  it("falls back rather than breaking on a token it cannot read", () => {
    expect(avatarOf("upload:abc123", USER)).toBe(avatarOf(null, USER));
  });

  it("spreads across the presets rather than piling onto one", () => {
    const drawn = new Set(
      Array.from({ length: 400 }, (_, index) => avatarOf(null, `user-${index}`)),
    );
    expect(drawn.size).toBe(AVATAR_PRESETS.length);
  });
});

describe("the art", () => {
  // art.ts can't be imported here (Vite resolves the SVGs, vitest doesn't), so
  // the guard that every preset has a file is a directory read
  it("ships one file per preset and no orphans", () => {
    const dir = fileURLToPath(new URL("../assets/avatars", import.meta.url));
    expect(readdirSync(dir).sort()).toEqual(AVATAR_PRESETS.map((preset) => `${preset}.svg`));
  });
});
