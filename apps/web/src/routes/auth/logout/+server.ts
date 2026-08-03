import { redirect } from "@sveltejs/kit";
import { clearSession, logoutUrl } from "$lib/server/cognito";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = ({ url, cookies }) => {
  clearSession(cookies);
  // Cognito's logout endpoint also ends the hosted session, then bounces home
  redirect(302, logoutUrl(url.origin));
};
