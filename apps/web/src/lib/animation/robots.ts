/**
 * Per-robot facts the *viewer* needs, keyed by `robots.slug`.
 *
 * The API's `ROBOT_PROFILES` (apps/api/src/payload.ts) is the validation
 * authority — channel count, angle range, keyframe ceiling. This registry is
 * the presentation half: where the model lives and what to call each channel.
 * They're deliberately separate; the API has no business knowing about glb
 * files, and the browser has no business re-deriving validation limits.
 *
 * Rig geometry is NOT here. Pivot nodes carry their own glTF extras
 * (`{ channel, axis, neutralDeg }`), so the scene resolves them by traversal
 * and a new robot needs no code change here beyond its entry below.
 */

export interface RobotViewerProfile {
  /** Human-readable channel names, indexed by channel number. */
  channelLabels: string[];
}

export const ROBOT_VIEWER_PROFILES: Record<string, RobotViewerProfile> = {
  "robo-cat-ears": {
    channelLabels: ["Left azimuth", "Left latitude", "Right azimuth", "Right latitude"],
  },
};

/** Where a robot's rigged model is served from, immutable-cached. */
export function modelUrlFor(robotSlug: string): string {
  return `/models/${robotSlug}.glb`;
}

/**
 * Channel labels for a robot, falling back to positional names so an unknown
 * robot renders as "Channel 1…n" rather than breaking the page.
 */
export function channelLabelsFor(robotSlug: string, channelCount: number): string[] {
  const labels = ROBOT_VIEWER_PROFILES[robotSlug]?.channelLabels ?? [];
  return Array.from({ length: channelCount }, (_, i) => labels[i] ?? `Channel ${i + 1}`);
}
