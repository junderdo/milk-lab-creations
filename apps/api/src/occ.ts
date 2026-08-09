// DSQL uses optimistic concurrency: concurrent write transactions abort with
// a serialization conflict instead of blocking. Conflicts are retryable by
// design, so every write procedure runs through this helper.

const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [20, 80];

/** Prisma write-conflict code and the underlying pg serialization_failure. */
const OCC_CODES = new Set(["P2034", "40001"]);

export function isOccConflict(error: unknown): boolean {
  for (let cause = error; cause instanceof Error || (cause && typeof cause === "object");) {
    if (OCC_CODES.has((cause as { code?: unknown }).code as string)) return true;
    cause = (cause as { cause?: unknown }).cause;
    if (!cause) break;
  }
  return false;
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
