import { describe, expect, it, vi } from "vitest";
import { handshake } from "./connect";
import { SUB_OPCODE } from "./protocol";
import type { EarsSession, RequestOutcome } from "./session";
import { STATUS_CODE, statusFrom } from "./status";

const CAPABILITY_PAYLOAD = new Uint8Array([1, 16, 0x01, 0xfd]);
const ok = (payload: Uint8Array): RequestOutcome => ({ kind: "ok", payload });

function fakeSession(outcomes: Partial<Record<number, RequestOutcome>>) {
  const asked: number[] = [];
  const disconnect = vi.fn();
  const session: EarsSession = {
    deviceName: "ROBO_CAT_EARS",
    maxChunkBytes: 20,
    request: (subOpcode) => {
      asked.push(subOpcode);
      return Promise.resolve(outcomes[subOpcode] ?? { kind: "link-lost" });
    },
    disconnect,
  };
  return { session, asked, disconnect };
}

describe("handshake", () => {
  it("reads CAPABILITY then LIST, in that order", async () => {
    const { session, asked } = fakeSession({
      [SUB_OPCODE.capability]: ok(CAPABILITY_PAYLOAD),
      [SUB_OPCODE.list]: ok(new Uint8Array([1, 2, ...new Array<number>(16).fill(0), 4, 66, 108, 101, 112])),
    });

    const result = await handshake(session);

    expect(asked).toEqual([SUB_OPCODE.capability, SUB_OPCODE.list]);
    expect(result).toMatchObject({
      ok: true,
      capability: { protocolVersion: 1, slotCount: 16, maxChunkBytes: 509 },
    });
    expect(result.ok && result.slots).toHaveLength(16);
    expect(result.ok && result.slots[2]?.entry?.name).toBe("Blep");
  });

  it("takes the frame size off CAPABILITY before asking anything bigger", async () => {
    const { session } = fakeSession({
      [SUB_OPCODE.capability]: ok(CAPABILITY_PAYLOAD),
      [SUB_OPCODE.list]: ok(new Uint8Array([0])),
    });

    await handshake(session);

    expect(session.maxChunkBytes).toBe(509);
  });

  it("disconnects on an unknown protocol version and says which side is stale", async () => {
    const { session, asked, disconnect } = fakeSession({
      [SUB_OPCODE.capability]: ok(new Uint8Array([2, 16, 0x01, 0xfd])),
    });

    const result = await handshake(session);

    expect(result).toMatchObject({ ok: false });
    expect(result.ok === false && result.message).toContain("this app");
    expect(asked).toEqual([SUB_OPCODE.capability]);
    expect(disconnect).toHaveBeenCalled();
  });

  it("reports a silent CAPABILITY as unknown rather than as a refusal", async () => {
    const { session, disconnect } = fakeSession({ [SUB_OPCODE.capability]: { kind: "unknown" } });

    const result = await handshake(session);

    expect(result).toMatchObject({ ok: false });
    expect(result.ok === false && result.message).toMatch(/quiet/i);
    expect(disconnect).toHaveBeenCalled();
  });

  it("surfaces a status the ears answered with", async () => {
    const { session } = fakeSession({
      [SUB_OPCODE.capability]: {
        kind: "failed",
        status: statusFrom(STATUS_CODE.unsupportedOpcode),
      },
    });

    const result = await handshake(session);

    expect(result.ok === false && result.message).toBe(statusFrom(STATUS_CODE.unsupportedOpcode).message);
  });

  it("refuses a capability record it cannot parse", async () => {
    const { session, disconnect } = fakeSession({
      [SUB_OPCODE.capability]: ok(new Uint8Array([1, 16])),
    });

    const result = await handshake(session);

    expect(result).toMatchObject({ ok: false });
    expect(disconnect).toHaveBeenCalled();
  });

  it("refuses a listing it cannot parse rather than showing empty slots", async () => {
    const { session, disconnect } = fakeSession({
      [SUB_OPCODE.capability]: ok(CAPABILITY_PAYLOAD),
      [SUB_OPCODE.list]: ok(new Uint8Array([4, 0])),
    });

    const result = await handshake(session);

    expect(result).toMatchObject({ ok: false });
    expect(disconnect).toHaveBeenCalled();
  });
});
