/**
 * Freeing a slot and trying what is in one, from the same grid that fills them.
 *
 * Two rules from `docs/adr/0001-web-app-connect-and-upload-ux.md` shape this
 * module. `DELETE` is idempotent on the device, so an unknown outcome resolves
 * by asking rather than by reasoning, and saying "delete it again" is always
 * safe advice. And `PLAY` answers `OK` on acceptance, not on completion — there
 * is no duration on the wire, so nothing here reports an in-flight play.
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

const WENT_QUIET = "Your ears went quiet.";
const DISCONNECTED = "Your ears disconnected.";

export async function deleteSlot(
  session: EarsSession,
  request: SlotActionRequest,
): Promise<SlotActionResult> {
  const outcome = await session.request(SUB_OPCODE.delete, slotPayload(request.slot));

  switch (outcome.kind) {
    case "ok":
      return {
        kind: "done",
        message: `Slot ${slotNumber(request.slot)} is empty now.`,
        slots: withCleared(request),
      };
    case "failed":
      return { kind: "failed", message: statusText(outcome.status), slots: null };
    case "unknown":
      return await checkWhetherItCleared(session, request, WENT_QUIET);
    case "link-lost":
      return await checkWhetherItCleared(session, request, DISCONNECTED);
    default: {
      const unhandled: never = outcome;
      throw new Error(`unhandled outcome: ${String(unhandled)}`);
    }
  }
}

async function checkWhetherItCleared(
  session: EarsSession,
  request: SlotActionRequest,
  opening: string,
): Promise<SlotActionResult> {
  const where = `slot ${slotNumber(request.slot)}`;
  const retry = "Deleting it again is safe — your ears take a second delete the same way.";

  const reread = await readSlots(session, request.slots.length);
  if (reread.ok === false) {
    return {
      kind: "unclear",
      message: `${opening} This app couldn't re-read their slots either, so it can't tell whether ${where} was emptied. ${retry}`,
      slots: null,
    };
  }

  const after = reread.slots.find((slot) => slot.index === request.slot);
  return after?.entry == null
    ? {
        kind: "done",
        message: `${opening} It did delete — ${where} is empty now.`,
        slots: reread.slots,
      }
    : {
        kind: "failed",
        message: `${opening} It didn't delete — ${where} still holds “${occupantName(after)}”. ${retry}`,
        slots: reread.slots,
      };
}

export async function playSlot(
  session: EarsSession,
  request: SlotActionRequest,
): Promise<SlotActionResult> {
  const playing = nameInSlot(request);
  const outcome = await session.request(SUB_OPCODE.play, slotPayload(request.slot));

  switch (outcome.kind) {
    case "ok":
      // no in-flight state to render and none rendered: OK means the ears took
      // the command, and there is no completion event to wait for
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
}

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
    ? { kind: "stale", message: `${gone} The grid now shows what they're holding.`, slots: reread.slots }
    : {
        kind: "stale",
        message: `${gone} This app couldn't re-read their slots either; reconnect to see what they're holding.`,
        slots: null,
      };
}

function slotPayload(slot: number): Uint8Array {
  return new Uint8Array([slot]);
}

function nameInSlot({ slot, slots }: SlotActionRequest): string {
  const cached = slots.find((each) => each.index === slot);
  return cached?.entry == null ? `slot ${slotNumber(slot)}` : occupantName(cached);
}

function withCleared({ slot, slots }: SlotActionRequest): Slot[] {
  return slots.map((each) => (each.index === slot ? { index: each.index, entry: null } : each));
}
