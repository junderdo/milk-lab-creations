/**
 * The mandated connect sequence, once the link is up and subscribed:
 * `CAPABILITY` -> `LIST` -> operate.
 *
 * `CAPABILITY` comes first because `slot_count` and `max_chunk_bytes` are
 * per-connection facts a client must not hardcode, and `LIST` before any upload
 * because there is no server-side slot allocation — the client picks the target,
 * so it has to know what is occupied.
 */

import {
  SUB_OPCODE,
  buildSlots,
  parseCapability,
  parseList,
  versionVerdict,
  type Capability,
  type Slot,
  type SubOpcode,
} from "./protocol";
import type { EarsSession, RequestOutcome } from "./session";

export type HandshakeResult =
  | { readonly ok: true; readonly capability: Capability; readonly slots: Slot[] }
  | { readonly ok: false; readonly message: string };

export async function handshake(session: EarsSession): Promise<HandshakeResult> {
  const capabilityPayload = await payloadOf(session, SUB_OPCODE.capability);
  if (capabilityPayload.ok === false) return refuse(session, capabilityPayload.message);

  const capability = parseCapability(capabilityPayload.payload);
  if (capability === undefined) {
    return refuse(session, "Your ears answered with a capability record this app can't read.");
  }

  const verdict = versionVerdict(capability.protocolVersion);
  if (verdict.ok === false) return refuse(session, verdict.message);

  session.maxChunkBytes = capability.maxChunkBytes;

  const listPayload = await payloadOf(session, SUB_OPCODE.list);
  if (listPayload.ok === false) return refuse(session, listPayload.message);

  const entries = parseList(listPayload.payload);
  if (entries === undefined) {
    return refuse(session, "Your ears sent a slot list this app can't read.");
  }

  return { ok: true, capability, slots: buildSlots(capability.slotCount, entries) };
}

function refuse(session: EarsSession, message: string): HandshakeResult {
  session.disconnect();
  return { ok: false, message };
}

type PayloadResult =
  | { readonly ok: true; readonly payload: Uint8Array }
  | { readonly ok: false; readonly message: string };

async function payloadOf(session: EarsSession, subOpcode: SubOpcode): Promise<PayloadResult> {
  return describe(await session.request(subOpcode, new Uint8Array(0)));
}

function describe(outcome: RequestOutcome): PayloadResult {
  switch (outcome.kind) {
    case "ok":
      return { ok: true, payload: outcome.payload };
    case "failed":
      return { ok: false, message: outcome.status.message };
    case "unknown":
      return { ok: false, message: "Your ears went quiet before they finished connecting." };
    case "link-lost":
      return { ok: false, message: "Your ears dropped the connection." };
    default: {
      const unhandled: never = outcome;
      throw new Error(`unhandled outcome: ${String(unhandled)}`);
    }
  }
}
