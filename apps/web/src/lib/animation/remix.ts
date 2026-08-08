/**
 * Where an animation came from, as one value.
 *
 * The API answers in two fields so that "not a remix" can be told apart from
 * "remixed from something you can't see". That reading is the only one any view
 * wants, so the pair collapses here once rather than in each of them.
 */

export interface RemixProvenance {
  remixedFromId: string | null;
  remixedFrom: { id: string; name: string } | null;
}

export type RemixOrigin =
  | { kind: "none" }
  | { kind: "known"; id: string; name: string }
  /** Deleted, or since made private — deliberately indistinguishable. */
  | { kind: "unavailable" };

export function remixOriginOf({ remixedFromId, remixedFrom }: RemixProvenance): RemixOrigin {
  if (remixedFromId === null) return { kind: "none" };
  if (remixedFrom === null) return { kind: "unavailable" };
  return { kind: "known", id: remixedFrom.id, name: remixedFrom.name };
}
