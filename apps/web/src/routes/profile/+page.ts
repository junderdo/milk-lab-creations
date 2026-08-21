import { redirect } from "@sveltejs/kit";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ parent }) => {
  // the layout already fetched both the row this page is about and the device
  // list; fetching either again here would only be the same query under a
  // different cache entry, and the list has to load in the layout anyway so the
  // registration prompt can be derived on any page (§10.6)
  const { accessToken, me } = await parent();
  if (!accessToken || !me) redirect(302, "/auth/login");

  return { me };
};
