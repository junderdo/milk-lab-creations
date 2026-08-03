import { error } from "@sveltejs/kit";
import { trpc } from "$lib/trpc";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ fetch, params, parent }) => {
  const { accessToken } = await parent();
  try {
    // the UUID in the URL is the unlisted link; visibility is enforced API-side
    const animation = await trpc(fetch, accessToken).animations.byId.query({ id: params.id });
    return { animation };
  } catch {
    error(404, "Animation not found");
  }
};
