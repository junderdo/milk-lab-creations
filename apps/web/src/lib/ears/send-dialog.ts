/**
 * What the send dialog says, as a pure function of the slot list, the chosen
 * target and the name in the field.
 *
 * Overwrite is confirmed inline here rather than in a second modal: the grid
 * already shows what is in the slot, so the warning names the occupant and the
 * button says what it will do. `STORE` is unconditional and atomic on the
 * device, so nothing here may promise an undo.
 *
 * Slots are numbered from 1 for people and from 0 on the wire; the `+ 1` lives
 * here and in nothing that talks to the device.
 */

import type { Slot } from "./protocol";
import { MAX_SLOT_NAME_BYTES, utf8ByteLength } from "./store";

export function slotLabel(index: number): string {
  return `slot ${index + 1}`;
}

/** A slot the ears themselves made carries no `Animation.id` to match on. */
export function occupantName(slot: Slot): string {
  if (slot.entry === null) return "empty";
  return slot.entry.animationId === null
    ? `${slot.entry.name} (made on the ears)`
    : slot.entry.name;
}

export interface DialogInput {
  readonly slots: readonly Slot[];
  readonly target: number | undefined;
  readonly name: string;
  /** The animation being sent, so the grid can mark where it already lives. */
  readonly animationId: string;
}

export interface DialogView {
  readonly confirmLabel: string;
  /** Rendered inline above the button; `null` when the target is empty. */
  readonly overwriteWarning: string | null;
  readonly nameBytes: number;
  readonly nameProblem: string | null;
  readonly canConfirm: boolean;
}

export function dialogView({ slots, target, name, animationId }: DialogInput): DialogView {
  const nameBytes = utf8ByteLength(name);
  const nameProblem = problemWithName(name, nameBytes);
  const slot = target === undefined ? undefined : slots.find((each) => each.index === target);

  if (slot === undefined) {
    return {
      confirmLabel: "Choose a slot",
      overwriteWarning: null,
      nameBytes,
      nameProblem,
      canConfirm: false,
    };
  }

  const occupied = slot.entry !== null;
  return {
    confirmLabel: occupied
      ? `Replace ${slotLabel(slot.index)}`
      : `Save to ${slotLabel(slot.index)}`,
    overwriteWarning: occupied ? overwriteWarning(slot, animationId) : null,
    nameBytes,
    nameProblem,
    canConfirm: nameProblem === null,
  };
}

function overwriteWarning(slot: Slot, animationId: string): string {
  const where = slotLabel(slot.index).replace("slot", "Slot");
  return slot.entry?.animationId === animationId
    ? `${where} already holds this animation as “${occupantName(slot)}”. Sending replaces it — there's no undo.`
    : `${where} holds “${occupantName(slot)}”. Sending replaces it — there's no undo.`;
}

function problemWithName(name: string, nameBytes: number): string | null {
  if (name.trim().length === 0) return "Your ears need a name for this animation.";
  if (nameBytes > MAX_SLOT_NAME_BYTES) {
    return `That's ${nameBytes} bytes; your ears take ${MAX_SLOT_NAME_BYTES}.`;
  }
  return null;
}
