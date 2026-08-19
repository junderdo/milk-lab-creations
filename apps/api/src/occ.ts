// DSQL uses optimistic concurrency: concurrent write transactions abort with
// a serialization conflict instead of blocking. Conflicts are retryable by
// design, so every write procedure runs through this helper.

const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [20, 80];

/** Prisma write-conflict code and the underlying pg serialization_failure. */
const OCC_CODES = new Set(["P2034", "40001"]);

/** Prisma unique-constraint code and the underlying pg unique_violation. */
export const UNIQUE_VIOLATION_CODES = new Set(["P2002", "23505"]);

/**
 * Whether `error`, or anything it wraps, carries one of `codes`. The driver
 * nests the pg error under the Prisma one, so the cause chain is walked.
 */
export function hasErrorCode(error: unknown, codes: ReadonlySet<string>): boolean {
  for (let cause = error; cause instanceof Error || (cause && typeof cause === "object");) {
    if (codes.has((cause as { code?: unknown }).code as string)) return true;
    cause = (cause as { cause?: unknown }).cause;
    if (!cause) break;
  }
  return false;
}

export function isOccConflict(error: unknown): boolean {
  return hasErrorCode(error, OCC_CODES);
}

export async function withOccRetry<T>(write: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await write();
    } catch (error) {
      if (attempt >= MAX_ATTEMPTS || !isOccConflict(error)) throw error;
      await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt - 1] ?? 100));
    }
  }
}
