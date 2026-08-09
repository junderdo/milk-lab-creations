import { listQueryInput, parseListQuery } from "$lib/animation/list-query";
import { trpc } from "$lib/trpc";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ fetch, url }) => {
  // public gallery: no auth needed
  const query = parseListQuery(url.searchParams);
  const client = trpc(fetch);
  const [gallery, robots] = await Promise.all([
    client.animations.gallery.query(listQueryInput(query)),
    client.robots.list.query(),
  ]);
  return { gallery, robots, query };
};
