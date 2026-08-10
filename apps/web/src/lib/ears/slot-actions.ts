/**
 * Freeing a slot and trying what is in one, from the same grid that fills them.
 *
 * Two rules from `docs/adr/0001-web-app-connect-and-upload-ux.md` shape this
 * module. `DELETE` is idempotent on the device, so "delete it again" is always
 * safe advice and an unknown outcome never needs a guess. And `PLAY` answers
 * `OK` on acceptance, not on completion — there is no duration on the wire, so
 * nothing here reports an in-flight play.
 *
 * `SLOT_EMPTY` and `SLOT_OUT_OF_RANGE` on a play mean one thing only: the
 * cached list is stale. They are handled as news about the store, not as a
 * failure of the command.
 */

import { readSlots } from "./connect";
import { SUB_OPCODE, type Slot } from "./protocol";
import type { EarsSession } from "./session";
import { occupantName, slotNumber } from "./slot-copy";
import { STATUS_CODE, statusText } from "./status";

export type SlotActionOutcome =
  /** Confirmed on the device, either by an OK or by a re-read that found it. */
  | "done"
  /** The store changed underneath us; the grid, not the command, was wrong. */
  | "stale"
  /** Confirmed not done. */
  | "failed"
  /** The outcome is genuinely unknown and the app will not guess. */
  | "unclear";

export interface SlotActionResult {
  readonly kind: SlotActionOutcome;
  readonly message: string;
  /** A fresh slot list when this call learnt one, else `null`. */
  readonly slots: readonly Slot[] | null;
}

export interface SlotActionRequest {
  readonly slot: number;
  /** The slot list as it stands, which the result is reported against. */
  readonly slots: readonly Slot[];
}

export interface SlotActionHooks {
  /** The request ended without an answer and the re-read has begun. */
  onChecking?(message: string): void;
}

/** What the dialog's grid buttons invoke; `deleteSlot` and `playSlot` both fit. */
export type SlotAction = (
  session: EarsSession,
  request: SlotActionRequest,
  hooks?: SlotActionHooks,
) => Promise<SlotActionResult>;

const WENT_QUIET = "Your ears went quiet.";
const DISCONNECTED = "Your ears disconnected.";
const DELETE_AGAIN = "Deleting it again is safe — your ears take a second delete the same way.";

export const deleteSlot: SlotAction = async (session, request, hooks = {}) => {
  const outcome = await session.request(SUB_OPCODE.delete, slotPayload(request.slot));

  switch (outcome.kind) {
    // the device answers OK to a delete of an empty slot, and SLOT_EMPTY would
    // say the same thing: the slot the user wanted emptied is empty
    case "ok":
      return emptied(request);
    case "failed":
      return outcome.status.code === STATUS_CODE.slotEmpty
        ? emptied(request)
        : { kind: "failed", message: statusText(outcome.status), slots: null };
    case "unknown":
      return await checkWhetherItCleared(session, request, hooks);
    // a re-read over a link that just died can only fail, so the round trip is
    // skipped and the idempotency is the answer instead
    case "link-lost":
      return {
        kind: "unclear",
        message: `${DISCONNECTED} This app can't tell whether ${where(request.slot)} was emptied. ${DELETE_AGAIN}`,
        slots: null,
      };
    default: {
      const unhandled: never = outcome;
      throw new Error(`unhandled outcome: ${String(unhandled)}`);
    }
  }
};

function emptied(request: SlotActionRequest): SlotActionResult {
  return {
    kind: "done",
    message: `Slot ${slotNumber(request.slot)} is empty now.`,
    slots: withCleared(request),
  };
}

async function checkWhetherItCleared(
  session: EarsSession,
  request: SlotActionRequest,
  hooks: SlotActionHooks,
): Promise<SlotActionResult> {
  hooks.onChecking?.(`${WENT_QUIET} Checking whether it deleted…`);

  const reread = await readSlots(session, request.slots.length);
  if (reread.ok === false) {
    return {
      kind: "unclear",
      message: `${WENT_QUIET} This app couldn't re-read their slots either, so it can't tell whether ${where(request.slot)} was emptied. ${DELETE_AGAIN}`,
      slots: null,
    };
  }

  const after = reread.slots.find((slot) => slot.index === request.slot);
  if (after === undefined) {
    return {
      kind: "unclear",
      message: `${WENT_QUIET} Their slot list came back without ${where(request.slot)}, so this app can't tell whether it was emptied. ${DELETE_AGAIN}`,
      slots: reread.slots,
    };
  }

  return after.entry === null
    ? {
        kind: "done",
        message: `${WENT_QUIET} It did delete — ${where(request.slot)} is empty now.`,
        slots: reread.slots,
      }
    : {
        kind: "failed",
        message: `${WENT_QUIET} It didn't delete — ${where(request.slot)} still holds “${occupantName(after)}”. ${DELETE_AGAIN}`,
        slots: reread.slots,
      };
}

export const playSlot: SlotAction = async (session, request) => {
  const playing = nameInSlot(request);
  const outcome = await session.request(SUB_OPCODE.play, slotPayload(request.slot));

  switch (outcome.kind) {
    case "ok":
      return { kind: "done", message: `Your ears are playing “${playing}”.`, slots: null };
    case "failed":
      return isStale(outcome.status.code)
        ? await reportGone(session, request, playing)
        : { kind: "failed", message: statusText(outcome.status), slots: null };
    case "unknown":
      return {
        kind: "unclear",
        message: `${WENT_QUIET} This app can't tell whether they played “${playing}”.`,
        slots: null,
      };
    case "link-lost":
      return {
        kind: "unclear",
        message: `${DISCONNECTED} This app can't tell whether they played “${playing}”.`,
        slots: null,
      };
    default: {
      const unhandled: never = outcome;
      throw new Error(`unhandled outcome: ${String(unhandled)}`);
    }
  }
};

function isStale(code: number): boolean {
  return code === STATUS_CODE.slotEmpty || code === STATUS_CODE.slotOutOfRange;
}

/**
 * Neither status is a failure to report: both say the store changed under a
 * grid drawn at connect time, so the answer is a fresh grid and the news that
 * the animation is no longer there.
 */
async function reportGone(
  session: EarsSession,
  request: SlotActionRequest,
  playing: string,
): Promise<SlotActionResult> {
  const gone = `“${playing}” isn't on your ears any more — their slots changed while this page was open.`;

  const reread = await readSlots(session, request.slots.length);
  return reread.ok
    ? {
        kind: "stale",
        message: `${gone} The grid now shows what they're holding.`,
        slots: reread.slots,
      }
    : {
        kind: "stale",
        message: `${gone} This app couldn't re-read their slots either; reconnect to see what they're holding.`,
        slots: null,
      };
}

function slotPayload(slot: number): Uint8Array {
  return new Uint8Array([slot]);
}

function where(slot: number): string {
  return `slot ${slotNumber(slot)}`;
}

function nameInSlot({ slot, slots }: SlotActionRequest): string {
  const cached = slots.find((each) => each.index === slot);
  return cached === undefined || cached.entry === null ? where(slot) : occupantName(cached);
}

function withCleared({ slot, slots }: SlotActionRequest): Slot[] {
  return slots.map((each) => (each.index === slot ? { index: each.index, entry: null } : each));
}
