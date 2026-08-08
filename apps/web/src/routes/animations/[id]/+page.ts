import { error } from "@sveltejs/kit";
import { trpc } from "$lib/trpc";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ fetch, params, parent }) => {
  const { accessToken } = await parent();
  try {
    const api = trpc(fetch, accessToken);
    // the UUID in the URL is the unlisted link; visibility is enforced API-side
    const animation = await api.animations.byId.query({ id: params.id });
    // signed out there is no Remix button to disable, so there is nothing to ask
    const quota = accessToken ? await api.animations.quota.query() : null;
    return { animation, quota };
  } catch {
    error(404, "Animation not found");
  }
};
