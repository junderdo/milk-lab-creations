import { error, redirect } from "@sveltejs/kit";
import { limitsFor } from "$lib/editor/document";
import { trpc } from "$lib/trpc";
import type { PageLoad } from "./$types";

/** Client-rendered for the same reason as the edit route: it is all canvas. */
export const ssr = false;

/**
 * The robots a new animation can be authored for.
 *
 * A robot with no validation profile is one whose documents the API would
 * reject on save, so it is not offered — the same rule the edit route applies,
 * from the other side. `?robot=<slug>` picks one; without it the first robot
 * that can be edited is the one, which is what makes this route work with a
 * single robot today and with several later, hardcoding neither.
 */
export const load: PageLoad = async ({ fetch, parent, url }) => {
  const { accessToken } = await parent();
  if (!accessToken) redirect(302, "/auth/login");

  const robots = await trpc(fetch, accessToken).robots.list.query();
  const editable = robots.flatMap((robot) => {
    const limits = limitsFor(robot.slug);
    return limits === undefined ? [] : [{ robot: { slug: robot.slug, name: robot.name }, limits }];
  });

  const requested = url.searchParams.get("robot");
  const chosen =
    requested === null ? editable[0] : editable.find((each) => each.robot.slug === requested);
  if (chosen === undefined) {
    error(501, requested === null ? "No robot can be edited yet" : `${requested} can't be edited`);
  }

  return chosen;
};
