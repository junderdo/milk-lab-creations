// Mid-session access-token renewal for the browser tRPC client.
import { json } from "@sveltejs/kit";
import { getAccessToken } from "$lib/server/cognito";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ cookies }) => {
  const accessToken = await getAccessToken(cookies);
  return json({ accessToken });
};
