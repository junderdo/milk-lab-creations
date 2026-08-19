/**
 * The one client-side copy of "my registered ears".
 *
 * A handful of rows that several readers want — the profile page lists them,
 * and `rename` and `forget` mutate them — so they are fetched once and mutated
 * in place rather than refetched. `invalidateAll()` is deliberately not used:
 * it would put a server round trip between an action and the UI agreeing with
 * it.
 *
 * `null` is not an empty list. It means we could not find out — signed out, or
 * a failed fetch — and the two must stay opposites: under *empty*, a connected
 * pair is unregistered and worth saying so about; under *unknown*, saying so
 * would nag someone about ears they named months ago
 * (`docs/spec/profile-and-devices.md` §10.6).
 *
 * Module-level state is shared across requests on the server, so seeding is
 * browser-only and the server renders from its load data directly.
 */

import type { inferRouterOutputs } from "@trpc/server";
import { browser } from "$app/environment";
import type { AppRouter } from "@milklab/api";

export type Device = inferRouterOutputs<AppRouter>["devices"]["list"][number];

function createDeviceStore() {
  let devices = $state<Device[] | null>(null);

  return {
    get all(): Device[] | null {
      return devices;
    },

    seed(list: Device[] | null): void {
      if (browser) devices = list;
    },

    /** The row as the server created it — `createdAt` is displayed, not invented. */
    add(device: Device): void {
      devices = [...(devices ?? []), device];
    },

    rename(serial: string, name: string): void {
      devices = devices?.map((d) => (d.serial === serial ? { ...d, name } : d)) ?? null;
    },

    remove(serial: string): void {
      devices = devices?.filter((d) => d.serial !== serial) ?? null;
    },
  };
}

export const deviceStore = createDeviceStore();
