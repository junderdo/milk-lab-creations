import { describe, expect, it } from "vitest";
import { deleteSlot, playSlot } from "./slot-actions";
import { SUB_OPCODE, type Slot } from "./protocol";
import type { EarsSession, RequestOutcome } from "./session";
import { STATUS_CODE, statusFrom } from "./status";

function occupied(index: number, animationId: string | null, name: string): Slot {
  return { index, entry: { index, animationId, name } };
}

const ANIMATION_ID = "00112233-4455-6677-8899-aabbccddeeff";

function listPayloadFor(entries: readonly { index: number; id: string; name: string }[]) {
  const bytes: number[] = [entries.length];
  for (const entry of entries) {
    bytes.push(entry.index);
    const hex = entry.id.replaceAll("-", "");
    for (let i = 0; i < 16; i++) bytes.push(Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16));
    const name = [...new TextEncoder().encode(entry.name)];
    bytes.push(name.length, ...name);
  }
  return new Uint8Array(bytes);
}

interface FakeSession {
  readonly session: EarsSession;
  readonly requests: { subOpcode: number; payload: Uint8Array }[];
}

function fakeSession(outcomes: RequestOutcome[]): FakeSession {
  const requests: { subOpcode: number; payload: Uint8Array }[] = [];
  const queued = [...outcomes];

  return {
    requests,
    session: {
      deviceId: "ears-1",
      deviceName: "ROBO_CAT_EARS",
      maxChunkBytes: 512,
      request: (subOpcode, payload) => {
        requests.push({ subOpcode, payload });
        return Promise.resolve(queued.shift() ?? { kind: "link-lost" as const });
      },
      disconnect: () => undefined,
    },
  };
}

const ok = { kind: "ok", payload: new Uint8Array(0) } as const;

function nacked(code: number): RequestOutcome {
  return { kind: "failed", status: statusFrom(code) };
}

const slots: readonly Slot[] = [
  occupied(0, ANIMATION_ID, "Tail flick"),
  { index: 1, entry: null },
  occupied(2, null, "Wiggle"),
];

describe("deleteSlot", () => {
  it("sends one DELETE carrying just the slot index", async () => {
    const fake = fakeSession([ok]);

    await deleteSlot(fake.session, { slot: 2, slots });

    expect(fake.requests).toEqual([
      { subOpcode: SUB_OPCODE.delete, payload: new Uint8Array([2]) },
    ]);
  });

  it("empties the slot in the returned list on OK", async () => {
    const fake = fakeSession([ok]);

    const result = await deleteSlot(fake.session, { slot: 0, slots });

    expect(result.kind).toBe("done");
    expect(result.slots).toEqual([{ index: 0, entry: null }, slots[1], slots[2]]);
  });

  it("reports an already-empty slot as done rather than as an error", async () => {
    // the device answers OK to a delete of an empty slot, so a grid gone stale
    // needs no special case here — only the absence of one
    const fake = fakeSession([ok]);

    const result = await deleteSlot(fake.session, { slot: 1, slots });

    expect(result.kind).toBe("done");
    expect(result.slots?.[1]).toEqual({ index: 1, entry: null });
  });

  it("reports a nack in the status's own words and keeps the cached list", async () => {
    const fake = fakeSession([nacked(STATUS_CODE.slotOutOfRange)]);

    const result = await deleteSlot(fake.session, { slot: 0, slots });

    expect(result.kind).toBe("failed");
    expect(result.message).toContain("SLOT_OUT_OF_RANGE");
    expect(result.slots).toBeNull();
  });

  it("treats SLOT_EMPTY as the slot being empty, which is what was asked for", async () => {
    const fake = fakeSession([nacked(STATUS_CODE.slotEmpty)]);

    const result = await deleteSlot(fake.session, { slot: 0, slots });

    expect(result.kind).toBe("done");
    expect(result.message).not.toContain("SLOT_EMPTY");
    expect(result.slots?.[0]).toEqual({ index: 0, entry: null });
  });

  it("re-reads LIST after a timeout and reports that it did delete", async () => {
    const fake = fakeSession([
      { kind: "unknown" },
      { kind: "ok", payload: listPayloadFor([{ index: 2, id: ANIMATION_ID, name: "Wiggle" }]) },
    ]);

    const result = await deleteSlot(fake.session, { slot: 0, slots });

    expect(fake.requests.map((each) => each.subOpcode)).toEqual([
      SUB_OPCODE.delete,
      SUB_OPCODE.list,
    ]);
    expect(result.kind).toBe("done");
    expect(result.slots?.[0]).toEqual({ index: 0, entry: null });
  });

  it("re-reads LIST after a timeout and reports that it did not delete", async () => {
    const fake = fakeSession([
      { kind: "unknown" },
      {
        kind: "ok",
        payload: listPayloadFor([{ index: 0, id: ANIMATION_ID, name: "Tail flick" }]),
      },
    ]);

    const result = await deleteSlot(fake.session, { slot: 0, slots });

    expect(result.kind).toBe("failed");
    expect(result.message).toContain("Tail flick");
    expect(result.slots?.[0]?.entry?.name).toBe("Tail flick");
  });

  it("says it is checking before it re-reads", async () => {
    const fake = fakeSession([
      { kind: "unknown" },
      { kind: "ok", payload: listPayloadFor([]) },
    ]);
    const checking: string[] = [];

    await deleteSlot(fake.session, { slot: 0, slots }, { onChecking: (m) => checking.push(m) });

    expect(checking).toEqual(["Your ears went quiet. Checking whether it deleted…"]);
  });

  it("cannot tell when the re-read fails too", async () => {
    const fake = fakeSession([{ kind: "unknown" }, { kind: "link-lost" }]);

    const result = await deleteSlot(fake.session, { slot: 0, slots });

    expect(result.kind).toBe("unclear");
    expect(result.slots).toBeNull();
    expect(result.message).toContain("Deleting it again is safe");
  });

  it("does not spend a round trip re-reading over a link that just died", async () => {
    const fake = fakeSession([{ kind: "link-lost" }]);

    const result = await deleteSlot(fake.session, { slot: 0, slots });

    expect(fake.requests).toHaveLength(1);
    expect(result.kind).toBe("unclear");
    expect(result.message).toContain("Deleting it again is safe");
  });
});

describe("playSlot", () => {
  it("sends one PLAY carrying just the slot index", async () => {
    const fake = fakeSession([ok]);

    await playSlot(fake.session, { slot: 2, slots });

    expect(fake.requests).toEqual([{ subOpcode: SUB_OPCODE.play, payload: new Uint8Array([2]) }]);
  });

  it("names what the ears are playing and learns no new slot list", async () => {
    const fake = fakeSession([ok]);

    const result = await playSlot(fake.session, { slot: 0, slots });

    expect(result.kind).toBe("done");
    expect(result.message).toContain("Tail flick");
    expect(result.slots).toBeNull();
  });

  it("re-reads LIST on SLOT_EMPTY and reports the animation is gone, not a failure", async () => {
    const fake = fakeSession([
      nacked(STATUS_CODE.slotEmpty),
      { kind: "ok", payload: listPayloadFor([{ index: 2, id: ANIMATION_ID, name: "Wiggle" }]) },
    ]);

    const result = await playSlot(fake.session, { slot: 0, slots });

    expect(fake.requests.map((each) => each.subOpcode)).toEqual([SUB_OPCODE.play, SUB_OPCODE.list]);
    expect(result.kind).toBe("stale");
    expect(result.message).toContain("Tail flick");
    expect(result.message).not.toContain("SLOT_EMPTY");
    expect(result.slots?.[0]).toEqual({ index: 0, entry: null });
  });

  it("treats SLOT_OUT_OF_RANGE on a play as the same stale cache", async () => {
    const fake = fakeSession([
      nacked(STATUS_CODE.slotOutOfRange),
      { kind: "ok", payload: listPayloadFor([]) },
    ]);

    const result = await playSlot(fake.session, { slot: 0, slots });

    expect(result.kind).toBe("stale");
    expect(result.slots).toEqual([
      { index: 0, entry: null },
      { index: 1, entry: null },
      { index: 2, entry: null },
    ]);
  });

  it("still says the animation is gone when the re-read fails", async () => {
    const fake = fakeSession([nacked(STATUS_CODE.slotEmpty), { kind: "link-lost" }]);

    const result = await playSlot(fake.session, { slot: 0, slots });

    expect(result.kind).toBe("stale");
    expect(result.slots).toBeNull();
  });

  it("reports any other nack in the status's own words", async () => {
    const fake = fakeSession([nacked(STATUS_CODE.storageFailure)]);

    const result = await playSlot(fake.session, { slot: 0, slots });

    expect(result.kind).toBe("failed");
    expect(result.message).toContain("STORAGE_FAILURE");
  });

  it("will not claim a play happened after a timeout", async () => {
    const fake = fakeSession([{ kind: "unknown" }]);

    const result = await playSlot(fake.session, { slot: 0, slots });

    expect(result.kind).toBe("unclear");
    expect(fake.requests).toHaveLength(1);
  });

  it("will not claim a play happened after the link dropped", async () => {
    const fake = fakeSession([{ kind: "link-lost" }]);

    const result = await playSlot(fake.session, { slot: 0, slots });

    expect(result.kind).toBe("unclear");
  });

  it("names a watch-authored slot by what the ears call it", async () => {
    const fake = fakeSession([ok]);

    const result = await playSlot(fake.session, { slot: 2, slots });

    expect(result.message).toContain("Wiggle");
  });
});
