/**
 * The dismissal store, as something a `$derived` can depend on.
 *
 * `dismissed.ts` stays pure and plainly testable; this is the same split
 * `theme.ts` / `theme.svelte.ts` already uses. It exists because the
 * registration prompt is *derived* rather than fired (§10.4), and a derived
 * value can only flip when one of its inputs is reactive — `localStorage` is
 * not. Without this, "Not now" would write the key and the dialog would stay
 * open, which is exactly the outcome §10.4's "a closing gesture that writes
 * nothing cannot close the dialog" is arranged around.
 *
 * One counter for the whole store rather than one per key: dismissals are rare
 * — at most one per pair of ears, ever — and the readers are a single `$derived`
 * over the connected pair, so a re-read costs one `getItem`.
 */

import { dismiss, isDismissed, localDismissalStorage, type DismissalStorage } from "./dismissed";

function createDismissals() {
  const storage = localDismissalStorage();
  let version = $state(0);

  const tracked: DismissalStorage = {
    getItem(key) {
      void version;
      return storage.getItem(key);
    },
    setItem(key, value) {
      storage.setItem(key, value);
      version++;
    },
  };

  return {
    /** What `registrationPrompt` and `forgetDevice` are handed. */
    get storage(): DismissalStorage {
      return tracked;
    },
    has: (userId: string, serial: string) => isDismissed(tracked, userId, serial),
    dismiss: (userId: string, serial: string) => dismiss(tracked, userId, serial),
  };
}

export const dismissals = createDismissals();
