import { redirect } from "@sveltejs/kit";
import { authorizeUrl } from "$lib/server/cognito";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = ({ url }) => {
  redirect(302, authorizeUrl(url.origin));
};
