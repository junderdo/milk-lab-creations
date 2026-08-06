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
