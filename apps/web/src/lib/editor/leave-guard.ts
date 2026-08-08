/**
 * What to do when something tries to navigate away from unsaved work.
 *
 * The decision is separated from `beforeNavigate` because the interesting parts
 * of it — a Back that must be answered with a Back, an unload that belongs to
 * the browser's prompt rather than ours — are the parts nobody can reach by
 * hand in a browser reliably enough to trust.
 */

/** Where the user was going, and how they asked to go there. */
export interface LeaveTarget {
  url: URL;
  /** Triggered by Back or Forward: resuming it means moving through history, not to a URL. */
  viaHistory: boolean;
}

export type LeaveDecision =
  | { kind: "allow" }
  /** Cancel and say nothing: cancelling an unload is what raises the native prompt. */
  | { kind: "warn-native" }
  | { kind: "ask"; leave: LeaveTarget };

export interface LeaveAttempt {
  dirty: boolean;
  /** The user already answered "Leave"; this navigation is that answer being carried out. */
  confirmed: boolean;
  willUnload: boolean;
  to: URL | null;
  viaHistory: boolean;
}

export function leaveDecision(attempt: LeaveAttempt): LeaveDecision {
  if (!attempt.dirty || attempt.confirmed) return { kind: "allow" };
  if (attempt.willUnload) return { kind: "warn-native" };
  // no destination to hold on to, so a dialog offering "Leave" could not honour it
  if (attempt.to === null) return { kind: "allow" };
  return { kind: "ask", leave: { url: attempt.to, viaHistory: attempt.viaHistory } };
}
