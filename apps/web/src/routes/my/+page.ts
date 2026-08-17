import { redirect } from "@sveltejs/kit";
import { dev } from "$app/environment";
import { listQueryInput, parseListQuery } from "$lib/animation/list-query";
import { trpc } from "$lib/trpc";
// PROTOTYPE — throwaway, prototype/profile-and-registration. Remove with the branch.
import { stubMyPageData } from "./PROTOTYPE-stub-data";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ fetch, parent, url }) => {
  const { accessToken } = await parent();
  const query = parseListQuery(url.searchParams);
  // PROTOTYPE — a variant in the URL means fakes are acceptable, so the
  // variants run on the dev server alone: signed out, don't bounce to Cognito;
  // signed in with no API on :3001, don't 500 on a real query either. A stale
  // cookie from earlier work must not decide whether the prototype loads.
  const prototyping = dev && url.searchParams.has("variant");
  if (prototyping && !accessToken) return stubMyPageData(query);

  if (!accessToken) redirect(302, "/auth/login");
  const client = trpc(fetch, accessToken);
  try {
    // the page shows one page of animations, so the cap counter is its own query
    const [mine, robots, quota] = await Promise.all([
      client.animations.mine.query(listQueryInput(query)),
      client.robots.list.query(),
      client.animations.quota.query(),
    ]);
    return { mine, robots, quota, query };
  } catch (error) {
    if (prototyping) return stubMyPageData(query);
    throw error;
  }
};
