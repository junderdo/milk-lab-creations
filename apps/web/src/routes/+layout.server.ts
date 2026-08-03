import { getAccessToken } from "$lib/server/cognito";
import { trpc } from "$lib/trpc";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async ({ cookies, fetch }) => {
  const accessToken = await getAccessToken(cookies);

  let me = null;
  if (accessToken) {
    try {
      me = await trpc(fetch, accessToken).users.me.query();
    } catch {
      me = null; // expired/revoked session — render logged-out
    }
  }

  return { accessToken, me };
};
