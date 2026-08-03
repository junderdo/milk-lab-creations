import { trpc } from "$lib/trpc";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ fetch }) => {
  // public gallery: no auth needed
  const gallery = await trpc(fetch).animations.gallery.query({ limit: 50 });
  return { gallery };
};
