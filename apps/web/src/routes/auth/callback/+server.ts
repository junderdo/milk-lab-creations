import { redirect } from "@sveltejs/kit";
import { consumeState, exchangeCode, storeSession } from "$lib/server/cognito";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ url, cookies }) => {
  const code = url.searchParams.get("code");
  // reject codes that didn't originate from our own /auth/login (login CSRF)
  if (code && consumeState(cookies, url.searchParams.get("state"))) {
    const tokens = await exchangeCode(url.origin, code);
    if (tokens) storeSession(cookies, tokens);
  }
  redirect(302, "/");
};
