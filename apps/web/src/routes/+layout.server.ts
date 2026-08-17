import { dev } from "$app/environment";
import { getAccessToken } from "$lib/server/cognito";
import { trpc } from "$lib/trpc";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async ({ cookies, fetch }) => {
  // PROTOTYPE — throwaway, prototype/profile-and-registration. A refresh cookie
  // left over from real work sends this down the token-refresh path, and
  // PUBLIC_COGNITO_DOMAIN is unset when the web app runs without SST — so the
  // refresh fetch throws and 500s *every* route, prototype or not. Remove with
  // the branch; the production behaviour is a separate question.
  let accessToken: string | null = null;
  try {
    accessToken = await getAccessToken(cookies);
  } catch (error) {
    if (!dev) throw error;
    accessToken = null;
  }

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
