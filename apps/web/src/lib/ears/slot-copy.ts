/**
 * How a slot is named to a person.
 *
 * Slots are numbered from 0 on the wire and from 1 on screen. The `+ 1` lives
 * here and in nothing that talks to the device.
 */

import type { Slot } from "./protocol";

export function slotNumber(index: number): number {
  return index + 1;
}

/** A slot the ears themselves made carries no `Animation.id` to match on. */
export function occupantName(slot: Slot): string {
  if (slot.entry === null) return "empty";
  return slot.entry.animationId === null
    ? `${slot.entry.name} (made on the ears)`
    : slot.entry.name;
}
