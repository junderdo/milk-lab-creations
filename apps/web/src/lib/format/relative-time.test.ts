import { describe, expect, it } from "vitest";
import { humanizedSince } from "./relative-time";

const now = new Date("2026-08-07T12:00:00.000Z");
const ago = (ms: number) => humanizedSince(new Date(now.getTime() - ms), now);

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("humanizedSince", () => {
  it("does not count the seconds", () => {
    expect(ago(0)).toBe("just now");
    expect(ago(59 * SECOND)).toBe("just now");
  });

  it("counts in the largest unit that fits", () => {
    expect(ago(MINUTE)).toBe("1 minute ago");
    expect(ago(90 * MINUTE)).toBe("1 hour ago");
    expect(ago(5 * HOUR)).toBe("5 hours ago");
    expect(ago(30 * DAY)).toBe("30 days ago");
  });

  it("says yesterday rather than 1 day ago", () => {
    expect(ago(DAY)).toBe("yesterday");
  });

  it("treats a clock that has gone backwards as now", () => {
    expect(ago(-HOUR)).toBe("just now");
  });
});
