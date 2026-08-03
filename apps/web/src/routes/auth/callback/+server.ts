import { redirect } from "@sveltejs/kit";
import { exchangeCode, storeSession } from "$lib/server/cognito";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ url, cookies }) => {
  const code = url.searchParams.get("code");
  if (code) {
    const tokens = await exchangeCode(url.origin, code);
    if (tokens) storeSession(cookies, tokens);
  }
  redirect(302, "/");
};
