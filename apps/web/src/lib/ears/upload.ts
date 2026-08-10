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
import { slotNumber } from "./slot-copy";
import { buildStorePayload } from "./store";
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

export interface UploadHooks {
  /** Each frame as it lands, against the count the session actually sent. */
  onProgress?(framesSent: number, frameCount: number): void;
  /** The transfer ended without an answer and the re-read has begun. */
  onChecking?(message: string): void;
}

export async function sendToSlot(
  session: EarsSession,
  request: UploadRequest,
  hooks: UploadHooks = {},
): Promise<UploadResult> {
  const payload = buildStorePayload(request);
  if (payload === undefined) {
    return {
      kind: "not-stored",
      message: "This app couldn't build that request; reload the page and try again.",
      slots: null,
    };
  }

  const outcome = await session.request(SUB_OPCODE.store, payload, {
    onProgress: hooks.onProgress,
  });

  switch (outcome.kind) {
    case "ok":
      return {
        kind: "stored",
        message: `Saved to slot ${slotNumber(request.slot)} as “${request.name}”.`,
        slots: withStored(request),
      };
    case "failed":
      return { kind: "not-stored", message: statusText(outcome.status), slots: null };
    // both of these are unknown outcomes, and both get the same treatment: ask
    // the ears rather than guess. A dead link makes the re-read fail fast, and
    // "this app can't tell" is still the honest answer rather than "it failed"
    case "unknown":
      return await checkWhetherItSaved(session, request, WENT_QUIET, hooks);
    case "link-lost":
      return await checkWhetherItSaved(session, request, DISCONNECTED, hooks);
    default: {
      const unhandled: never = outcome;
      throw new Error(`unhandled outcome: ${String(unhandled)}`);
    }
  }
}

const WENT_QUIET = "Your ears went quiet.";
const DISCONNECTED = "Your ears disconnected mid-transfer.";

async function checkWhetherItSaved(
  session: EarsSession,
  request: UploadRequest,
  opening: string,
  hooks: UploadHooks,
): Promise<UploadResult> {
  hooks.onChecking?.(`${opening} Checking whether it saved…`);

  const where = `slot ${slotNumber(request.slot)}`;
  const reread = await readSlots(session, request.slots.length);
  if (reread.ok === false) {
    return {
      kind: "unclear",
      message: `${opening} This app couldn't re-read their slots either, so it can't tell whether it saved. Nothing was retried — reconnect to see.`,
      slots: null,
    };
  }

  const after = reread.slots.find((slot) => slot.index === request.slot);
  if (!holdsWhatWeSent(after, request)) {
    return {
      kind: "not-stored",
      message: `${opening} It didn't save — ${where} is unchanged. Nothing was retried, so send it again when you're ready.`,
      slots: reread.slots,
    };
  }

  // the default target is the slot already holding this animation, so finding
  // it there proves nothing unless it was not already there under this name
  const before = request.slots.find((slot) => slot.index === request.slot);
  return holdsWhatWeSent(before, request)
    ? {
        kind: "unclear",
        message: `${opening} ${where} was already holding this animation under that name, so this app can't tell whether this version landed. Nothing was retried — send it again to be sure.`,
        slots: reread.slots,
      }
    : {
        kind: "stored",
        message: `${opening} It did save — ${where} is holding “${request.name}”.`,
        slots: reread.slots,
      };
}

function holdsWhatWeSent(slot: Slot | undefined, request: UploadRequest): boolean {
  return slot?.entry?.animationId === request.animationId && slot.entry.name === request.name;
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
