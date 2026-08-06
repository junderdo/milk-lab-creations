/**
 * Per-robot facts the *viewer* needs, keyed by `robots.slug`.
 *
 * The API's `ROBOT_PROFILES` (apps/api/src/payload.ts) is the validation
 * authority — channel count, angle range, keyframe ceiling. This is the
 * presentation half: where a robot's model lives. They're deliberately
 * separate; the API has no business knowing about glb files.
 *
 * Rig geometry is NOT here. Pivot nodes carry their own glTF extras
 * (`{ channel, axis, neutralDeg }`), so the scene resolves them by traversal
 * and a new robot needs no code change beyond dropping in its glb.
 */

/** Where a robot's rigged model is served from, immutable-cached. */
export function modelUrlFor(robotSlug: string): string {
  return `/models/${robotSlug}.glb`;
}

/** What to call a channel: on a chip (`short`) and to a screen reader (`full`). */
export interface ChannelLabel {
  short: string;
  full: string;
}

/**
 * Channel order is the rig's, and it is the payload's: index 0 is the first
 * angle in every keyframe. Knowing that "channel 2" is the right ear swivelling
 * is the difference between an editable curve and a numbered line.
 */
const CHANNEL_LABELS: Record<string, ChannelLabel[]> = {
  "robo-cat-ears": [
    { short: "L az", full: "Left ear azimuth" },
    { short: "L lat", full: "Left ear latitude" },
    { short: "R az", full: "Right ear azimuth" },
    { short: "R lat", full: "Right ear latitude" },
  ],
};

/**
 * Labels for a robot's channels, padded with numbers for anything unnamed.
 *
 * Unlike the validation profile, a missing label is not a reason to refuse to
 * edit: "Channel 3" is a worse name, not a wrong one.
 */
export function channelLabelsFor(robotSlug: string, channels: number): ChannelLabel[] {
  const named = CHANNEL_LABELS[robotSlug] ?? [];
  return Array.from({ length: channels }, (_unused, channel) => {
    const label = named[channel];
    return label ?? { short: `Ch ${channel + 1}`, full: `Channel ${channel + 1}` };
  });
}
