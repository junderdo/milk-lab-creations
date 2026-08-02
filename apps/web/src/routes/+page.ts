import type { PageLoad } from "./$types";
import { trpc } from "$lib/trpc";

export const load: PageLoad = async ({ fetch }) => {
  const greeting = await trpc(fetch).greet.query({ name: "world" });
  return { greeting };
};
