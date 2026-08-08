// The tRPC context is the app's single test seam: production wires it from
// the linked DSQL resource and verified JWT claims; tests inject doubles.
import type { AuthUser, Profile } from "./auth.ts";
import type { Db } from "./db.ts";

export interface Context {
  db: Db;
  /** Verified caller, or null when anonymous. */
  user: AuthUser | null;
  /** Fetches profile claims for JIT provisioning, by pool username (faked in tests). */
  fetchProfile: (username: string) => Promise<Profile>;
}
