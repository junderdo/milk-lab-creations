import { describe, expect, it } from "vitest";
import {
  MAX_SLOT_NAME_BYTES,
  animationIdBytes,
  buildStorePayload,
  frameCount,
  truncateToBytes,
  utf8ByteLength,
} from "./store";

describe("truncateToBytes", () => {
  it("leaves a name already inside the budget alone", () => {
    expect(truncateToBytes("Tail flick", MAX_SLOT_NAME_BYTES)).toBe("Tail flick");
  });

  it("cuts ASCII at the byte budget", () => {
    expect(truncateToBytes("a".repeat(40), MAX_SLOT_NAME_BYTES)).toBe("a".repeat(32));
  });

  it("never splits a multi-byte code point", () => {
    // 11 x 3-byte = 33 bytes, one over: the 11th character goes whole
    const truncated = truncateToBytes("あ".repeat(11), MAX_SLOT_NAME_BYTES);
    expect(truncated).toBe("あ".repeat(10));
    expect(utf8ByteLength(truncated)).toBe(30);
  });

  it("never splits an astral code point", () => {
    // a 4-byte emoji, 8 of them = 32 bytes exactly, plus one that must not split
    expect(truncateToBytes("😺".repeat(9), MAX_SLOT_NAME_BYTES)).toBe("😺".repeat(8));
  });

  it("keeps a surrogate pair together rather than emitting half of one", () => {
    const truncated = truncateToBytes("a".repeat(30) + "😺", MAX_SLOT_NAME_BYTES);
    expect(truncated).toBe("a".repeat(30));
  });
});

describe("utf8ByteLength", () => {
  it("counts bytes, not characters", () => {
    expect(utf8ByteLength("cat")).toBe(3);
    expect(utf8ByteLength("😺")).toBe(4);
    expect(utf8ByteLength("あ")).toBe(3);
  });
});

describe("animationIdBytes", () => {
  it("packs a uuid into 16 big-endian bytes", () => {
    const bytes = animationIdBytes("00112233-4455-6677-8899-aabbccddeeff") ?? new Uint8Array(0);
    expect([...bytes]).toEqual([
      0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xaa, 0xbb, 0xcc, 0xdd, 0xee,
      0xff,
    ]);
  });

  it("is always sixteen bytes, whatever the uuid", () => {
    expect(animationIdBytes("3f2504e0-4f89-11d3-9a0c-0305e82c3301")).toHaveLength(16);
  });

  it("returns undefined for anything that is not a uuid", () => {
    expect(animationIdBytes("not-a-uuid")).toBeUndefined();
    expect(animationIdBytes("00112233445566778899aabbccddee")).toBeUndefined();
  });
});

describe("buildStorePayload", () => {
  it("lays out [slot][animation_id:16][name_len][name][wire_format]", () => {
    const wire = new Uint8Array([1, 2, 3]);
    const payload = buildStorePayload({
      slot: 5,
      animationId: "00112233-4455-6677-8899-aabbccddeeff",
      name: "Hi",
      wire,
    });

    expect(payload).toBeDefined();
    if (payload === undefined) return;
    expect(payload[0]).toBe(5);
    expect([...payload.slice(1, 17)]).toEqual([
      0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xaa, 0xbb, 0xcc, 0xdd, 0xee,
      0xff,
    ]);
    expect(payload[17]).toBe(2);
    expect([...payload.slice(18, 20)]).toEqual([0x48, 0x69]);
    expect([...payload.slice(20)]).toEqual([1, 2, 3]);
  });

  it("writes the name's byte length, not its character count", () => {
    const payload = buildStorePayload({
      slot: 0,
      animationId: "00112233-4455-6677-8899-aabbccddeeff",
      name: "😺",
      wire: new Uint8Array([0]),
    });

    expect(payload?.[17]).toBe(4);
  });

  it("refuses a name that would not fit the device's 32 bytes", () => {
    expect(
      buildStorePayload({
        slot: 0,
        animationId: "00112233-4455-6677-8899-aabbccddeeff",
        name: "a".repeat(33),
        wire: new Uint8Array([0]),
      }),
    ).toBeUndefined();
  });

  it("refuses an empty name, which the ears reject as INVALID_NAME", () => {
    expect(
      buildStorePayload({
        slot: 0,
        animationId: "00112233-4455-6677-8899-aabbccddeeff",
        name: "",
        wire: new Uint8Array([0]),
      }),
    ).toBeUndefined();
  });
});

describe("frameCount", () => {
  it("counts frames against the payload bytes each frame carries", () => {
    // 20 - 5 header = 15 payload bytes per frame
    expect(frameCount(15, 20)).toBe(1);
    expect(frameCount(16, 20)).toBe(2);
    expect(frameCount(30, 20)).toBe(2);
  });

  it("is one frame for an empty payload, never zero", () => {
    expect(frameCount(0, 20)).toBe(1);
  });

  it("is two frames for a worst-case store at a 512-byte chunk", () => {
    // slot(1) + id(16) + name_len(1) + name(32) + wire(769) = 819
    expect(frameCount(819, 512)).toBe(2);
  });
});
