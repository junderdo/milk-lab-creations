import { redirect } from "@sveltejs/kit";
import { dev } from "$app/environment";
import { listQueryInput, parseListQuery } from "$lib/animation/list-query";
import { trpc } from "$lib/trpc";
// PROTOTYPE — throwaway, prototype/profile-and-registration. Remove with the branch.
import { stubMyPageData } from "./PROTOTYPE-stub-data";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ fetch, parent, url }) => {
  const { accessToken } = await parent();
  // PROTOTYPE — signed out with a variant selected, serve fakes instead of
  // bouncing to Cognito, so the variants run on the dev server alone.
  if (dev && !accessToken && url.searchParams.has("variant")) {
    return stubMyPageData(parseListQuery(url.searchParams));
  }
  if (!accessToken) redirect(302, "/auth/login");
  const query = parseListQuery(url.searchParams);
  const client = trpc(fetch, accessToken);
  // the page shows one page of animations, so the cap counter is its own query
  const [mine, robots, quota] = await Promise.all([
    client.animations.mine.query(listQueryInput(query)),
    client.robots.list.query(),
    client.animations.quota.query(),
  ]);
  return { mine, robots, quota, query };
};
