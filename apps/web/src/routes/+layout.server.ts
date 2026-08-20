import type { Device } from "$lib/devices/store.svelte";
import { getAccessToken } from "$lib/server/cognito";
import { trpc } from "$lib/trpc";
import type { LayoutServerLoad } from "./$types";

/**
 * `devices` rides along with `me` on purpose. The registration prompt is
 * derived from the device list, and a connect needs a click, which needs a
 * rendered page — so loading here means the list is always present before the
 * chip can be pressed, and there is no in-flight question to answer on the
 * connect path (`docs/spec/profile-and-devices.md` §10.6). Both queries go out
 * in one HTTP request via `httpBatchLink`, and this load does not re-run on
 * client-side navigation.
 *
 * `null` is not an empty list: it means we could not find out. Under *empty* a
 * connected pair is unregistered and worth saying so about; under *unknown*,
 * saying so nags someone about ears they named months ago.
 */
export const load: LayoutServerLoad = async ({ cookies, fetch }) => {
  const accessToken = await getAccessToken(cookies);

  let me = null;
  let devices: Device[] | null = null;
  if (accessToken) {
    const api = trpc(fetch, accessToken);
    try {
      me = await api.users.me.query();
    } catch {
      me = null; // expired/revoked session — render logged-out
    }
    if (me) {
      try {
        devices = await api.devices.list.query();
      } catch {
        devices = null;
      }
    }
  }

  return { accessToken, me, devices };
};
