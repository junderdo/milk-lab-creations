/**
 * The one place the device procedures are bound to the tRPC client.
 *
 * `actions.ts` takes its dependencies as parameters so the write orderings it
 * owns stay testable without a server; this is the single real binding those
 * actions are handed in the app. Three components used to build it inline,
 * which meant three copies of the same four lines.
 */

import { trpc } from "$lib/trpc";
import type { DeviceApi } from "./actions";

export const deviceApi: DeviceApi = {
  list: () => trpc().devices.list.query(),
  register: (input) => trpc().devices.register.mutate(input),
  rename: (input) => trpc().devices.rename.mutate(input),
  forget: (input) => trpc().devices.forget.mutate(input),
};
