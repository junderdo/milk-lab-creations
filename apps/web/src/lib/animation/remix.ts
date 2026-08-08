/**
 * Where an animation came from, as one value.
 *
 * The API answers this in two fields — `remixedFromId` stays on the record even
 * when `remixedFrom` cannot be resolved — because that pair is what tells "not a
 * remix" apart from "remixed from something you can't see". Every caller wants
 * the second reading, so the pair collapses here once rather than in each view.
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
