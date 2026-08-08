/**
 * What a rejected save actually was — boundary parse for the error thrown by
 * `animations.update`.
 *
 * A lost-update rejection is a `CONFLICT` whose formatted error data carries
 * the server's current record (`errorFormatter` in `apps/api/src/trpc.ts`), so
 * the editor can offer both conflict choices without a second round-trip. That
 * record arrives as opaque JSON on an error object typed `unknown`, which is
 * exactly the place a cast would turn a shape change into a crash inside a
 * catch block. Anything that does not parse as a conflict is an ordinary
 * failure with a message — including a conflict we could not read, which is
 * still true and still actionable.
 */

import { ANIMATION_CAP_MESSAGE, isAnimationCapError } from "../quota";
import type { LoadedAnimation } from "./editor-state";

export type SaveFailure =
  | { kind: "conflict"; server: LoadedAnimation }
  /**
   * `retryable` is false where sending the identical request again cannot
   * succeed — the animation cap. Offering "Try again" there is an invitation
   * to a loop, so the banner drops the button.
   */
  | { kind: "message"; message: string; retryable: boolean };

const GENERIC_MESSAGE = "Could not save. Please try again.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** superjson revives Dates, but a plain JSON error body would not. */
function asDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function asLoadedAnimation(value: unknown): LoadedAnimation | null {
  if (!isRecord(value)) return null;
  const { id, name, description, payload } = value;
  const updatedAt = asDate(value.updatedAt);
  if (typeof id !== "string" || typeof name !== "string" || updatedAt === null) return null;
  return {
    id,
    name,
    description: typeof description === "string" ? description : null,
    payload,
    updatedAt,
  };
}

function messageOf(error: unknown): string {
  if (!isRecord(error) || typeof error.message !== "string" || error.message === "") {
    return GENERIC_MESSAGE;
  }
  return error.message;
}

export function saveFailureFrom(error: unknown): SaveFailure {
  const data = isRecord(error) ? error.data : undefined;
  if (isRecord(data) && data.code === "CONFLICT") {
    const server = asLoadedAnimation(data.current);
    if (server !== null) return { kind: "conflict", server };
  }
  if (isAnimationCapError(error)) {
    return { kind: "message", message: ANIMATION_CAP_MESSAGE, retryable: false };
  }
  return { kind: "message", message: messageOf(error), retryable: true };
}
