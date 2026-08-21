/**
 * Which pairs of ears the user has told us to stop asking about.
 *
 * Client-side, and deliberately: a declined device is one the user refused to
 * associate with their account, so storing an identifier for it on the server
 * is the one option here that would need defending. The reasoning, and why the
 * dismissal is per-user rather than per-browser, is in
 * `docs/spec/profile-and-devices.md` §3.
 *
 * A dismissal silences the *prompt*, never the feature — the profile page
 * offers registration whether or not a key exists, and nothing here is ever
 * read by the page. Losing the whole store to a private window or cleared site
 * data therefore costs one extra prompt, which is why every call is wrapped and
 * silently degraded, as `theme.ts` and `draft.ts` already are.
 *
 * One key per dismissal rather than one JSON array: a check is a single
 * `getItem` with no read-modify-write, and a corrupt value poisons one pair
 * rather than all of them. Nothing enumerates dismissals.
 */

const KEY_PREFIX = "milklab:device-dismissed:";

/** The slice of `Storage` a dismissal needs — the seam tests substitute. */
export interface DismissalStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function dismissalKeyFor(userId: string, serial: string): string {
  return `${KEY_PREFIX}${userId}:${serial}`;
}

/**
 * Presence is the whole signal — the value is never read, so any string left
 * behind by an older build still counts as dismissed.
 */
export function isDismissed(
  storage: DismissalStorage,
  userId: string,
  serial: string,
): boolean {
  try {
    return storage.getItem(dismissalKeyFor(userId, serial)) !== null;
  } catch {
    return false;
  }
}

export function dismiss(storage: DismissalStorage, userId: string, serial: string): void {
  try {
    storage.setItem(dismissalKeyFor(userId, serial), "1");
  } catch {
    // a blocked origin costs one more prompt, not the answer the user gave
  }
}

/** `localStorage`, or a stand-in when the browser refuses to hand it over. */
export function localDismissalStorage(): DismissalStorage {
  try {
    // absent during SSR, and an access that throws outright on a blocked origin
    if (globalThis.localStorage !== undefined) return globalThis.localStorage;
  } catch {
    // fall through to the stand-in
  }
  return { getItem: () => null, setItem: () => {} };
}
