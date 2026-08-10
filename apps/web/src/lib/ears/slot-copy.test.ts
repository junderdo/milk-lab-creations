import { describe, expect, it } from "vitest";
import { occupantName, slotNumber } from "./slot-copy";

const OTHER_ID = "ffeeddcc-bbaa-9988-7766-554433221100";

describe("slotNumber", () => {
  it("numbers slots from one for people, though the wire counts from zero", () => {
    expect(slotNumber(0)).toBe(1);
    expect(slotNumber(15)).toBe(16);
  });
});

describe("occupantName", () => {
  it("labels a slot the ears made themselves", () => {
    expect(occupantName({ index: 3, entry: { index: 3, animationId: null, name: "Blink" } })).toBe(
      "Blink (made on the ears)",
    );
  });

  it("is just the name for anything the web app uploaded", () => {
    expect(
      occupantName({ index: 1, entry: { index: 1, animationId: OTHER_ID, name: "Blink" } }),
    ).toBe("Blink");
  });

  it("says empty for an empty slot", () => {
    expect(occupantName({ index: 0, entry: null })).toBe("empty");
  });
});
