import { redirect } from "@sveltejs/kit";
import { trpc } from "$lib/trpc";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ fetch, parent }) => {
  const { accessToken } = await parent();
  if (!accessToken) redirect(302, "/auth/login");
  const mine = await trpc(fetch, accessToken).animations.mine.query();
  return { mine };
};
