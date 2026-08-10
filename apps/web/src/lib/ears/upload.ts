/**
 * Putting one animation into one slot, and saying truthfully what happened.
 *
 * Two rules from `docs/adr/0001-web-app-connect-and-upload-ux.md` shape this
 * module. `STORE` is unconditional and atomic on the device, so a nack means
 * nothing was committed and the slot list is still good. And a timeout is an
 * unknown outcome, never a failure: the ears may well have saved, so the only
 * honest move is to re-read `LIST` and report what it says — never to assume,
 * and never to retry, because a blind retry could overwrite a slot the user
 * did not choose.
 */

import { readSlots } from "./connect";
import { SUB_OPCODE, type Slot } from "./protocol";
import type { EarsSession } from "./session";
import { buildStorePayload, frameCount } from "./store";
import { statusText } from "./status";

/**
 * The slot to preselect: the one already holding this animation, else the
 * first empty one. A full store holding nothing of ours has no default — the
 * user picks a victim.
 */
export function defaultSlot(slots: readonly Slot[], animationId: string): number | undefined {
  const holding = slots.find((slot) => slot.entry?.animationId === animationId);
  if (holding !== undefined) return holding.index;

  return slots.find((slot) => slot.entry === null)?.index;
}

export interface UploadRequest {
  readonly slot: number;
  readonly animationId: string;
  /** What the ears will call it — already inside 32 bytes. */
  readonly name: string;
  readonly wire: Uint8Array;
  /** The slot list as it stands, which the result is reported against. */
  readonly slots: readonly Slot[];
}

export type UploadOutcome =
  /** Confirmed on the device, either by an OK or by a re-read that found it. */
  | "stored"
  /** Confirmed *not* on the device: a nack commits nothing, or the re-read said so. */
  | "not-stored"
  /** The outcome is genuinely unknown and the app will not guess. */
  | "unclear";

export interface UploadResult {
  readonly kind: UploadOutcome;
  readonly message: string;
  /** A fresh slot list when this call learnt one, else `null`. */
  readonly slots: readonly Slot[] | null;
}

export type UploadProgress = (framesSent: number, frameCount: number) => void;

export async function sendToSlot(
  session: EarsSession,
  request: UploadRequest,
  onProgress?: UploadProgress,
): Promise<UploadResult> {
  const payload = buildStorePayload(request);
  if (payload === undefined) {
    return {
      kind: "not-stored",
      message: "This app couldn't build that request; reload the page and try again.",
      slots: null,
    };
  }

  const total = frameCount(payload.length, session.maxChunkBytes);
  const outcome = await session.request(SUB_OPCODE.store, payload, {
    onProgress: (sent) => onProgress?.(sent, total),
  });

  switch (outcome.kind) {
    case "ok":
      return {
        kind: "stored",
        message: `Saved to slot ${request.slot + 1} as "${request.name}".`,
        slots: withStored(request),
      };
    case "failed":
      return { kind: "not-stored", message: statusText(outcome.status), slots: null };
    case "link-lost":
      return {
        kind: "unclear",
        message:
          "Your ears disconnected mid-transfer, so this app can't tell whether it saved. Reconnect to see.",
        slots: null,
      };
    case "unknown":
      return await checkWhetherItSaved(session, request);
    default: {
      const unhandled: never = outcome;
      throw new Error(`unhandled outcome: ${String(unhandled)}`);
    }
  }
}

const WENT_QUIET = "Your ears went quiet.";

async function checkWhetherItSaved(
  session: EarsSession,
  request: UploadRequest,
): Promise<UploadResult> {
  const reread = await readSlots(session, request.slots.length);
  if (reread.ok === false) {
    return {
      kind: "unclear",
      message: `${WENT_QUIET} This app couldn't re-read their slots either, so it can't tell whether it saved. Reconnect to see.`,
      slots: null,
    };
  }

  const target = reread.slots.find((slot) => slot.index === request.slot);
  return target?.entry?.animationId === request.animationId
    ? {
        kind: "stored",
        message: `${WENT_QUIET} It did save — slot ${request.slot + 1} is holding "${target.entry.name}".`,
        slots: reread.slots,
      }
    : {
        kind: "not-stored",
        message: `${WENT_QUIET} It didn't save — slot ${request.slot + 1} is unchanged. Nothing was retried, so send it again when you're ready.`,
        slots: reread.slots,
      };
}

/**
 * The slot list after an acknowledged store, applied locally: the device just
 * confirmed exactly what it now holds, so a second round trip would only ask a
 * question already answered.
 */
function withStored(request: UploadRequest): Slot[] {
  return request.slots.map((slot) =>
    slot.index === request.slot
      ? {
          index: slot.index,
          entry: { index: slot.index, animationId: request.animationId, name: request.name },
        }
      : slot,
  );
}
