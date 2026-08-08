import { describe, expect, it } from "vitest";
import {
  clampTimelineHeight,
  DEFAULT_TIMELINE_HEIGHT,
  MIN_PREVIEW_HEIGHT,
  MIN_TIMELINE_HEIGHT,
  readTimelineHeight,
  timelineHeightFrom,
  TIMELINE_HEIGHT_STORAGE_KEY,
  writeTimelineHeight,
  type TimelineHeightStorage,
} from "./timeline-height";

/** A `localStorage` stand-in that can be told to fail the way a blocked origin does. */
function storage(seed: Record<string, string> = {}, blocked = false): TimelineHeightStorage {
  return {
    getItem: (key) => {
      if (blocked) throw new Error("blocked");
      return seed[key] ?? null;
    },
    setItem: (key, value) => {
      if (blocked) throw new Error("blocked");
      seed[key] = value;
    },
  };
}

describe("clampTimelineHeight", () => {
  const roomy = 1000;

  it("leaves a height the budget can afford", () => {
    expect(clampTimelineHeight(400, roomy)).toBe(400);
  });

  it("holds the timeline at its own minimum", () => {
    expect(clampTimelineHeight(10, roomy)).toBe(MIN_TIMELINE_HEIGHT);
  });

  it("stops short of squeezing the preview past its minimum", () => {
    expect(clampTimelineHeight(roomy, roomy)).toBe(roomy - MIN_PREVIEW_HEIGHT);
  });

  it("keeps the timeline usable when the window cannot satisfy both", () => {
    const cramped = MIN_TIMELINE_HEIGHT + MIN_PREVIEW_HEIGHT - 100;
    expect(clampTimelineHeight(cramped, cramped)).toBe(MIN_TIMELINE_HEIGHT);
  });

  it("returns whole pixels", () => {
    expect(clampTimelineHeight(300.6, roomy)).toBe(301);
  });
});

describe("timelineHeightFrom", () => {
  it("takes a stored number", () => {
    expect(timelineHeightFrom("420")).toBe(420);
  });

  it("falls back to the default when nothing is stored", () => {
    expect(timelineHeightFrom(null)).toBe(DEFAULT_TIMELINE_HEIGHT);
  });

  it.each(["", "   ", "tall", "NaN"])("falls back on unusable value %o", (raw) => {
    expect(timelineHeightFrom(raw)).toBe(DEFAULT_TIMELINE_HEIGHT);
  });

  it("lifts a stored value that is below the minimum", () => {
    expect(timelineHeightFrom("12")).toBe(MIN_TIMELINE_HEIGHT);
  });
});

describe("read/write", () => {
  it("round-trips through storage", () => {
    const store = storage();
    writeTimelineHeight(store, 412.4);
    expect(store.getItem(TIMELINE_HEIGHT_STORAGE_KEY)).toBe("412");
    expect(readTimelineHeight(store)).toBe(412);
  });

  it("costs the preference, not a render, when storage is blocked", () => {
    const store = storage({}, true);
    expect(() => writeTimelineHeight(store, 400)).not.toThrow();
    expect(readTimelineHeight(store)).toBe(DEFAULT_TIMELINE_HEIGHT);
  });
});
