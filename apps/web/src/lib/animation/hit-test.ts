/**
 * What a press on the graph canvas grabbed.
 *
 * The canvas resolves this itself rather than letting each dot and grip catch
 * its own pointer, because on a coarse pointer their hit areas have to overlap:
 * a 44 px target around a 14 px dot covers its neighbours, and "whichever
 * element is on top" is then the wrong answer roughly half the time. Nearest
 * centre wins instead, and a tie goes to the dot — the finer of the two edits,
 * and the one whose grip is one undo away if it was wrong.
 *
 * Hidden channels never reach here. Excluding them is what makes the channel
 * chips the precision tool for a stack of dots that share an x.
 */

export interface HitPoint {
  x: number;
  y: number;
}

export type HitTarget =
  | { kind: "dot"; index: number; channel: number }
  | { kind: "grip"; index: number }
  | { kind: "scrub" };

export interface DotCandidate {
  index: number;
  channel: number;
  x: number;
  y: number;
}

export interface GripCandidate {
  index: number;
  x: number;
  y: number;
}

export interface HitCandidates {
  dots: DotCandidate[];
  grips: GripCandidate[];
}

export interface HitAreas {
  /** How far a press may land from a centre and still count. */
  radiusPx: number;
  /** Grips own a full-height strip from the canvas top down to here. */
  gripBandBottomPx: number;
}

interface Ranked<T> {
  candidate: T;
  distance: number;
}

function nearest<T>(
  candidates: T[],
  distanceOf: (candidate: T) => number | null,
): Ranked<T> | null {
  let best: Ranked<T> | null = null;
  for (const candidate of candidates) {
    const distance = distanceOf(candidate);
    if (distance === null) continue;
    if (best === null || distance < best.distance) best = { candidate, distance };
  }
  return best;
}

export function hitTest(point: HitPoint, candidates: HitCandidates, areas: HitAreas): HitTarget {
  const dot = nearest(candidates.dots, ({ x, y }) => {
    const distance = Math.hypot(point.x - x, point.y - y);
    return distance <= areas.radiusPx ? distance : null;
  });

  // A strip, not a circle: a grip is a wide handle at the top of its column, so
  // horizontal aim is what should decide it and vertical reach is the band.
  const grip = nearest(candidates.grips, ({ x, y }) => {
    if (point.y > areas.gripBandBottomPx || Math.abs(point.x - x) > areas.radiusPx) return null;
    return Math.hypot(point.x - x, point.y - y);
  });

  if (dot !== null && (grip === null || dot.distance <= grip.distance)) {
    return { kind: "dot", index: dot.candidate.index, channel: dot.candidate.channel };
  }
  if (grip !== null) return { kind: "grip", index: grip.candidate.index };
  return { kind: "scrub" };
}
