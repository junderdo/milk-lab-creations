import { redirect } from "@sveltejs/kit";
import type { Device } from "$lib/devices/store.svelte";
import { trpc } from "$lib/trpc";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ fetch, parent }) => {
  const { accessToken, me } = await parent();
  // the layout already fetched the row this page is about; a second
  // users.me here would only be the same query with a different cache entry
  if (!accessToken || !me) redirect(302, "/auth/login");

  // null is "we could not find out", which the page says out loud rather than
  // drawing as an empty list — the same rule the layout's `me` already follows
  let devices: Device[] | null = null;
  try {
    devices = await trpc(fetch, accessToken).devices.list.query();
  } catch {
    devices = null;
  }

  return { me, devices };
};
