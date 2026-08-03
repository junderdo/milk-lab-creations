import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import { browser } from "$app/environment";
import { env } from "$env/dynamic/public";
import type { AppRouter } from "@milklab/api";

const DEFAULT_URL = "http://localhost:3001/trpc";

// Access token lives in memory only (never persisted client-side); the
// refresh token stays in an httpOnly cookie owned by the SvelteKit server.
let accessToken: string | null = null;
let expiresAtMs = 0;
// remembers a refresh that came back empty so anonymous visitors don't hit
// /auth/refresh on every query; any real token clears it
let sessionMissing = false;

/** Best-effort exp claim; a token we can't parse is treated as already stale. */
function tokenExpiryMs(token: string): number {
  try {
    const claims = JSON.parse(atob(token.split(".")[1] ?? "")) as { exp?: number };
    return (claims.exp ?? 0) * 1000;
  } catch {
    return 0;
  }
}

export function setAccessToken(token: string | null) {
  accessToken = token;
  expiresAtMs = token ? tokenExpiryMs(token) : 0;
  if (token) sessionMissing = false;
}

/** Renew the in-memory access token from the httpOnly refresh cookie. */
export async function refreshAccessToken(fetchFn: typeof fetch = fetch): Promise<string | null> {
  const response = await fetchFn("/auth/refresh", { method: "POST" });
  const { accessToken: token } = (await response.json()) as { accessToken: string | null };
  setAccessToken(token);
  sessionMissing = token === null;
  return token;
}

/** In-memory token, transparently renewed when absent or near expiry. */
async function currentAccessToken(fetchFn: typeof fetch): Promise<string | null> {
  if (!browser || sessionMissing) return accessToken;
  const staleAtMs = expiresAtMs - 30_000; // renew ahead of the deadline
  if (accessToken && Date.now() < staleAtMs) return accessToken;
  return refreshAccessToken(fetchFn).catch(() => accessToken);
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
        headers: async () => {
          const bearer = token ?? (await currentAccessToken(fetchFn));
          return bearer ? { authorization: `Bearer ${bearer}` } : {};
        },
      }),
    ],
  });
}
