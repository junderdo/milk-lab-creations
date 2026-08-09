import { redirect } from "@sveltejs/kit";
import { listQueryInput, parseListQuery } from "$lib/animation/list-query";
import { trpc } from "$lib/trpc";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ fetch, parent, url }) => {
  const { accessToken } = await parent();
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
