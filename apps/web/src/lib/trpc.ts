import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import { env } from "$env/dynamic/public";
import type { AppRouter } from "@milklab/api";

const DEFAULT_URL = "http://localhost:3001/trpc";

// Access token lives in memory only (never persisted client-side); the
// refresh token stays in an httpOnly cookie owned by the SvelteKit server.
let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

/** Renew the in-memory access token from the httpOnly refresh cookie. */
export async function refreshAccessToken(fetchFn: typeof fetch = fetch): Promise<string | null> {
  const response = await fetchFn("/auth/refresh", { method: "POST" });
  const { accessToken: token } = (await response.json()) as { accessToken: string | null };
  setAccessToken(token);
  return token;
}

// Build per-request and pass the load event's fetch so SSR responses are
// serialized into the page and not refetched on hydration. Server-side loads
// pass their token explicitly; the browser falls back to the in-memory one.
export function trpc(fetchFn: typeof fetch = fetch, token?: string | null) {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: env.PUBLIC_TRPC_URL ?? DEFAULT_URL,
        transformer: superjson,
        fetch: fetchFn,
        headers: () => {
          const bearer = token ?? accessToken;
          return bearer ? { authorization: `Bearer ${bearer}` } : {};
        },
      }),
    ],
  });
}
