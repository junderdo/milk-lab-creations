import { error, redirect } from "@sveltejs/kit";
import { limitsFor } from "$lib/editor/document";
import { atAnimationCap } from "$lib/quota";
import { trpc } from "$lib/trpc";
import type { PageLoad } from "./$types";

/** Client-rendered for the same reason as the edit route: it is all canvas. */
export const ssr = false;

/**
 * The robot a new animation is authored for: the first one that can be edited.
 *
 * A robot with no validation profile is one whose documents the API would
 * reject on save, so it is skipped — the same rule the edit route applies, from
 * the other side. Asking the list rather than naming a slug is what keeps this
 * route working when a second robot arrives; choosing between them is a picker
 * this project does not need while there is one.
 */
export const load: PageLoad = async ({ fetch, parent }) => {
  const { accessToken } = await parent();
  if (!accessToken) redirect(302, "/auth/login");

  // asked before the editor opens: an hour of authoring that the save refuses
  // is worse than a closed door
  const quota = await trpc(fetch, accessToken).animations.quota.query();
  if (atAnimationCap(quota.count)) redirect(302, "/my");

  const robots = await trpc(fetch, accessToken).robots.list.query();
  const chosen = robots.flatMap((robot) => {
    const limits = limitsFor(robot.slug);
    return limits === undefined ? [] : [{ robot: { slug: robot.slug, name: robot.name }, limits }];
  })[0];

  if (chosen === undefined) error(501, "No robot can be edited yet");
  return chosen;
};
