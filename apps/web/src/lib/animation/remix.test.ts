import { describe, expect, it } from "vitest";
import { remixOriginOf } from "./remix";

describe("remixOriginOf", () => {
  it("says an animation nobody forked has no origin", () => {
    expect(remixOriginOf({ remixedFromId: null, remixedFrom: null })).toEqual({ kind: "none" });
  });

  it("names the source when the viewer is allowed to see it", () => {
    expect(
      remixOriginOf({ remixedFromId: "src-1", remixedFrom: { id: "src-1", name: "Ear wiggle" } }),
    ).toEqual({ kind: "known", id: "src-1", name: "Ear wiggle" });
  });

  it("falls back to unavailable when the source cannot be resolved", () => {
    expect(remixOriginOf({ remixedFromId: "src-1", remixedFrom: null })).toEqual({
      kind: "unavailable",
    });
  });
});
