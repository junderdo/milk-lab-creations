/**
 * Who can see an animation, and what the editor says before changing it.
 *
 * Visibility is the one thing the editor does not buffer: it is not part of the
 * document, so Save cannot publish by accident and Ctrl+Z cannot unpublish by
 * accident. The price is that changing it writes immediately, which is why the
 * copy below is a confirmation rather than a label.
 */

import type { Visibility } from "@milklab/api";

export type { Visibility };

export interface VisibilityOption {
  value: Visibility;
  label: string;
  /** Who can see it, in the words the control itself shows. */
  summary: string;
}

export const VISIBILITY_OPTIONS = [
  { value: "private", label: "Private", summary: "Only you" },
  { value: "unlisted", label: "Unlisted", summary: "Anyone with the link" },
  { value: "public", label: "Public", summary: "Listed in the gallery" },
] as const satisfies readonly VisibilityOption[];

/** A visibility off the wire, or `null` for a value this build doesn't know. */
export function visibilityOf(value: string): Visibility | null {
  return VISIBILITY_OPTIONS.find((option) => option.value === value)?.value ?? null;
}

export interface VisibilityPrompt {
  title: string;
  body: string;
  /** The act, so the button says what pressing it does. */
  confirmLabel: string;
}

const IMMEDIATE =
  "This takes effect immediately — it is not part of Save, and undo won't reverse it.";

/**
 * The confirmation for moving to `to`.
 *
 * Keyed on the destination alone: what changes is who can see it from now on,
 * and every departure from a shared state breaks the links that were handed out
 * — so where it came from adds nothing the sentence needs.
 */
export function visibilityPrompt(to: Visibility): VisibilityPrompt {
  switch (to) {
    case "public":
      return {
        title: "Publish to the gallery?",
        body: `Anyone can find, view and remix this animation. ${IMMEDIATE}`,
        confirmLabel: "Publish",
      };
    case "unlisted":
      return {
        title: "Share by link?",
        body: `Anyone with the link can view and remix it, but it stays out of the gallery. ${IMMEDIATE}`,
        confirmLabel: "Share by link",
      };
    case "private":
      return {
        title: "Make this private?",
        body: `Only you will be able to see it, and any link you have shared stops working. ${IMMEDIATE}`,
        confirmLabel: "Make private",
      };
    default: {
      const unhandled: never = to;
      throw new Error(`unhandled visibility: ${String(unhandled)}`);
    }
  }
}
