import { redirect } from "@sveltejs/kit";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ parent }) => {
  const { accessToken, me } = await parent();
  // the layout already fetched the row this page is about; a second
  // users.me here would only be the same query with a different cache entry
  if (!accessToken || !me) redirect(302, "/auth/login");
  return { me };
};
