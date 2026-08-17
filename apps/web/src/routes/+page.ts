import { dev } from "$app/environment";
import { listQueryInput, parseListQuery, withoutVisibilityFilter } from "$lib/animation/list-query";
import { trpc } from "$lib/trpc";
// PROTOTYPE — throwaway, prototype/profile-and-registration. Remove with the branch.
import { stubGalleryData } from "./my/PROTOTYPE-stub-data";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ fetch, url }) => {
  // public gallery: no auth needed
  const query = withoutVisibilityFilter(parseListQuery(url.searchParams));
  const client = trpc(fetch);
  try {
    const [gallery, robots] = await Promise.all([
      client.animations.gallery.query(listQueryInput(query)),
      client.robots.list.query(),
    ]);
    return { gallery, robots, query };
  } catch (error) {
    // PROTOTYPE — no API on :3001 while running the web app alone, so the
    // header's Gallery link would 500 on the way back from a variant.
    if (dev) return stubGalleryData(query);
    throw error;
  }
};
