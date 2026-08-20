import { describe, expect, it } from "vitest";
import {
  STORE_TYPE,
  SUB_OPCODE,
  buildSlots,
  createReassembler,
  encodeRequest,
  parseCapability,
  parseList,
  parseResponseFrame,
  versionVerdict,
} from "./protocol";

const CAPABILITY_509 = {
  protocolVersion: 1,
  slotCount: 16,
  maxChunkBytes: 509,
  identity: { kind: "pre-serial" },
};

function payloadOf(length: number, fill = 0xaa): Uint8Array {
  return new Uint8Array(length).fill(fill);
}

describe("encodeRequest", () => {
  it("frames a payload-less request as one frame with the uniform header", () => {
    const frames = encodeRequest({
      corr: 7,
      subOpcode: SUB_OPCODE.capability,
      payload: new Uint8Array(0),
      maxChunkBytes: 509,
    });

    expect(frames).toHaveLength(1);
    expect([...(frames[0] ?? [])]).toEqual([STORE_TYPE, 7, SUB_OPCODE.capability, 0, 1]);
  });

  it("splits at max_chunk_bytes - 5 and repeats corr and sub-opcode in every chunk", () => {
    const frames = encodeRequest({
      corr: 3,
      subOpcode: SUB_OPCODE.store,
      payload: payloadOf(1000),
      maxChunkBytes: 509,
    });

    expect(frames.map((f) => f.length)).toEqual([509, 5 + (1000 - 504)]);
    expect(frames.map((f) => [...f.subarray(0, 5)])).toEqual([
      [STORE_TYPE, 3, SUB_OPCODE.store, 0, 2],
      [STORE_TYPE, 3, SUB_OPCODE.store, 1, 2],
    ]);
  });

  it("does not emit a trailing empty frame when the payload divides exactly", () => {
    const frames = encodeRequest({
      corr: 0,
      subOpcode: SUB_OPCODE.store,
      payload: payloadOf(1008),
      maxChunkBytes: 509,
    });

    expect(frames).toHaveLength(2);
  });

  it("refuses a chunk size that cannot carry the header", () => {
    expect(() =>
      encodeRequest({
        corr: 0,
        subOpcode: SUB_OPCODE.list,
        payload: new Uint8Array(0),
        maxChunkBytes: 5,
      }),
    ).toThrow();
  });
});

describe("parseResponseFrame", () => {
  it("reads the five-byte response header", () => {
    const frame = parseResponseFrame(new Uint8Array([STORE_TYPE, 9, 0x03, 1, 2, 0xde, 0xad]));

    expect(frame).toEqual({
      corr: 9,
      statusCode: 0x03,
      chunkIndex: 1,
      chunkCount: 2,
      payload: new Uint8Array([0xde, 0xad]),
    });
  });

  it("ignores a value that is not a store response", () => {
    // ABF2 is multiplexed: its readable value carries lighting state
    expect(parseResponseFrame(new Uint8Array([0x02, 1, 2, 3, 4]))).toBeUndefined();
    expect(parseResponseFrame(new Uint8Array([STORE_TYPE, 1, 0]))).toBeUndefined();
  });
});

describe("createReassembler", () => {
  const frame = (chunkIndex: number, chunkCount: number, payload: number[]) => ({
    corr: 1,
    statusCode: 0,
    chunkIndex,
    chunkCount,
    payload: new Uint8Array(payload),
  });

  it("completes a single-frame response", () => {
    const assembler = createReassembler();

    expect(assembler.accept(frame(0, 1, [0x01]))).toEqual({
      corr: 1,
      statusCode: 0,
      payload: new Uint8Array([0x01]),
    });
  });

  it("joins entries that straddle a frame boundary", () => {
    const assembler = createReassembler();

    expect(assembler.accept(frame(0, 2, [1, 2]))).toBeUndefined();
    expect(assembler.accept(frame(1, 2, [3, 4]))?.payload).toEqual(new Uint8Array([1, 2, 3, 4]));
  });

  it("drops a response whose chunks arrive out of order", () => {
    const assembler = createReassembler();

    assembler.accept(frame(0, 3, [1]));
    expect(assembler.accept(frame(2, 3, [3]))).toBeUndefined();
    expect(assembler.accept(frame(1, 3, [2]))).toBeUndefined();
  });

  it("lets a fresh chunk zero supersede a partial response", () => {
    const assembler = createReassembler();

    assembler.accept(frame(0, 2, [9]));
    expect(assembler.accept(frame(0, 1, [7]))?.payload).toEqual(new Uint8Array([7]));
  });
});

describe("parseCapability", () => {
  const HEADER = [1, 16, 0x01, 0xfd];
  const serialBytes = [0xde, 0xad, 0xbe, 0xef, 0x00, 0x01];

  it("reads the record big-endian", () => {
    expect(parseCapability(new Uint8Array(HEADER))).toEqual(CAPABILITY_509);
  });

  it("rejects a record too short to be one", () => {
    expect(parseCapability(new Uint8Array([1, 16, 0x01]))).toBeUndefined();
  });

  it("reads the appended serial as lowercase hex", () => {
    expect(parseCapability(new Uint8Array([...HEADER, ...serialBytes]))?.identity).toEqual({
      kind: "serial",
      serial: "deadbeef0001",
    });
  });

  it("keeps reading a serial when the record grows again after it", () => {
    expect(
      parseCapability(new Uint8Array([...HEADER, ...serialBytes, 0xff, 0xff]))?.identity,
    ).toEqual({ kind: "serial", serial: "deadbeef0001" });
  });

  // the whole point of the union: an all-zero serial hexes to "000000000000",
  // which passes the boundary regex, so a variant that could hold it would let
  // every failed unit in the fleet register as the same phantom device
  it("reads an all-zero serial as unidentified, never as a string", () => {
    const capability = parseCapability(new Uint8Array([...HEADER, 0, 0, 0, 0, 0, 0]));

    expect(capability?.identity).toEqual({ kind: "unidentified" });
    expect(JSON.stringify(capability)).not.toContain("000000000000");
  });

  // §7.3: firmware-behind is fixable and cannot-identify is not, so the two
  // causes must stay distinguishable at the only place that can see the length
  it("reads a four-byte record as pre-serial, not as unidentified", () => {
    expect(parseCapability(new Uint8Array(HEADER))?.identity).toEqual({ kind: "pre-serial" });
  });

  it.each([5, 6, 7, 8, 9])(
    "reads a %i-byte record as pre-serial rather than rejecting it",
    (length) => {
      const bytes = new Uint8Array(length);
      bytes.set(HEADER);

      expect(parseCapability(bytes)?.identity).toEqual({ kind: "pre-serial" });
    },
  );
});

describe("parseList", () => {
  const idBytes = (byte: number) => new Array<number>(16).fill(byte);
  const nameBytes = (name: string) => [...new TextEncoder().encode(name)];

  it("reads an empty store", () => {
    expect(parseList(new Uint8Array([0]))).toEqual([]);
  });

  it("reads sparse entries with their names", () => {
    const bytes = new Uint8Array([
      2,
      0,
      ...idBytes(0x11),
      4,
      ...nameBytes("Blep"),
      7,
      ...idBytes(0x22),
      3,
      ...nameBytes("Wag"),
    ]);

    expect(parseList(bytes)).toEqual([
      { index: 0, animationId: "11111111-1111-1111-1111-111111111111", name: "Blep" },
      { index: 7, animationId: "22222222-2222-2222-2222-222222222222", name: "Wag" },
    ]);
  });

  it("reads an all-zero animation id as watch-authored", () => {
    const bytes = new Uint8Array([1, 3, ...idBytes(0), 2, ...nameBytes("Hi")]);

    expect(parseList(bytes)?.[0]?.animationId).toBeNull();
  });

  it("rejects a truncated response rather than inventing a slot", () => {
    expect(parseList(new Uint8Array([1, 0, ...idBytes(1), 9, ...nameBytes("short")]))).toBe(
      undefined,
    );
    expect(parseList(new Uint8Array(0))).toBeUndefined();
  });

  it("ignores trailing bytes past the declared entries", () => {
    const bytes = new Uint8Array([1, 0, ...idBytes(1), 2, ...nameBytes("Hi"), 0xff, 0xff]);

    expect(parseList(bytes)).toHaveLength(1);
  });
});

describe("buildSlots", () => {
  it("expands a sparse listing to every slot the ears reported", () => {
    const slots = buildSlots(4, [{ index: 2, animationId: null, name: "Blep" }]);

    expect(slots.map((slot) => slot.entry?.name ?? null)).toEqual([null, null, "Blep", null]);
    expect(slots.map((slot) => slot.index)).toEqual([0, 1, 2, 3]);
  });

  it("drops an entry outside the reported slot count", () => {
    const slots = buildSlots(2, [{ index: 9, animationId: null, name: "Ghost" }]);

    expect(slots.every((slot) => slot.entry === null)).toBe(true);
  });
});

describe("versionVerdict", () => {
  it("accepts the version this client was written against", () => {
    expect(versionVerdict(1).ok).toBe(true);
  });

  it("names the ears as stale when they speak an older version", () => {
    const verdict = versionVerdict(0);

    expect(verdict).toMatchObject({ ok: false, stale: "ears" });
  });

  it("names the app as stale when the ears speak a newer version", () => {
    const verdict = versionVerdict(2);

    expect(verdict).toMatchObject({ ok: false, stale: "app" });
  });
});

describe("SUB_OPCODE", () => {
  it("names only the sub-opcodes the ears implement", () => {
    // RENAME and GET_ANIMATION are reserved-unimplemented and answer
    // UNSUPPORTED_OPCODE, so there is nothing here for a caller to reach for
    expect(Object.keys(SUB_OPCODE).sort()).toEqual([
      "capability",
      "delete",
      "list",
      "play",
      "store",
    ]);
  });
});
