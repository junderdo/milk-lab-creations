import { redirect } from "@sveltejs/kit";
import { authorizeUrl, issueState } from "$lib/server/cognito";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = ({ url, cookies }) => {
  redirect(302, authorizeUrl(url.origin, issueState(cookies)));
};
