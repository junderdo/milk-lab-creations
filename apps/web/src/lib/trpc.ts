import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import { env } from "$env/dynamic/public";
import type { AppRouter } from "@milklab/api";

const DEFAULT_URL = "http://localhost:3001/trpc";

// Build per-request and pass the load event's fetch so SSR responses are
// serialized into the page and not refetched on hydration.
export function trpc(fetchFn: typeof fetch = fetch) {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: env.PUBLIC_TRPC_URL ?? DEFAULT_URL,
        transformer: superjson,
        fetch: fetchFn,
      }),
    ],
  });
}
