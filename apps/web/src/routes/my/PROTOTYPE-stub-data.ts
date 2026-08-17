/**
 * PROTOTYPE — throwaway, prototype/profile-and-registration.
 *
 * Enough of `/my`'s loader payload to render the page signed out, so the
 * variants can be flipped through with `pnpm --filter @milklab/web dev` alone —
 * no AWS SSO, no personal SST stage, no Cognito round trip. The animations are
 * fake but real-shaped, because judging a profile layout against an empty list
 * is judging it in a vacuum.
 */

import type { ListQuery } from "$lib/animation/list-query";

function wave(count: number, spread: number) {
  return Array.from({ length: count }, (_, i) => ({
    timeMs: i * spread,
    angles: [Math.sin(i) * 40, Math.cos(i) * 30],
    easeInType: 1,
    easeOutType: 1,
    easeInMs: 60,
    easeOutMs: 60,
  }));
}

const ITEMS = [
  { name: "Curious tilt", keyframes: 6, spread: 220, visibility: "public", remixed: false },
  { name: "Startled flick", keyframes: 4, spread: 140, visibility: "private", remixed: false },
  { name: "Slow blink (remix)", keyframes: 9, spread: 300, visibility: "unlisted", remixed: true },
  { name: "Happy wiggle", keyframes: 12, spread: 180, visibility: "public", remixed: false },
];

function stubItems() {
  return ITEMS.map((item, i) => ({
    id: `00000000-0000-4000-8000-00000000000${i}`,
    name: item.name,
    payload: { keyframes: wave(item.keyframes, item.spread) },
    durationMs: item.keyframes * item.spread,
    keyframeCount: item.keyframes,
    visibility: item.visibility,
    remixedFromId: item.remixed ? "00000000-0000-4000-8000-0000000000ff" : null,
  }));
}

const ROBOTS = [{ slug: "robo-cat-ears", name: "Robo Cat Ears" }];

export function stubMyPageData(query: ListQuery) {
  const items = stubItems();
  return {
    mine: { items, page: 1, pageCount: 1, total: items.length },
    robots: ROBOTS,
    quota: { count: items.length, limit: 40 },
    query,
  };
}

/**
 * The gallery needs the tRPC API on :3001, which the prototype does not run.
 * Without this, the header's own "Gallery" link is a 500 — a dead end that has
 * nothing to do with the variants being judged.
 */
export function stubGalleryData(query: ListQuery) {
  const items = stubItems();
  return {
    gallery: {
      items: items.map((item) => ({
        ...item,
        owner: { displayName: "Jeff" },
        robot: ROBOTS[0],
      })),
      page: 1,
      pageCount: 1,
      total: items.length,
    },
    robots: ROBOTS,
    query,
  };
}
