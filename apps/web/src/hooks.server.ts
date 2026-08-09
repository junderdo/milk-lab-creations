import type { Handle } from "@sveltejs/kit";
import { env } from "$env/dynamic/private";
import { cloudflareBeaconTag } from "$lib/analytics/cloudflare";

const ANALYTICS_PLACEHOLDER = "%milklab.analytics%";

export const handle: Handle = ({ event, resolve }) =>
  resolve(event, {
    transformPageChunk: ({ html }) =>
      html.replace(ANALYTICS_PLACEHOLDER, cloudflareBeaconTag(env.CF_BEACON_TOKEN)),
  });
