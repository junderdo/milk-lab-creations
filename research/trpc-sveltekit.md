# Consuming a tRPC v11 API (AWS Lambda / SST v3) from SvelteKit 2 + Svelte 5

Research date: 2026-08-02. All npm versions/dates pulled from the npm registry; repo activity from the GitHub API.

## TL;DR Recommendation

**Use option (d): a hand-rolled `@trpc/client` (`createTRPCClient` + `httpBatchLink` + SuperJSON) called from SvelteKit `load` functions, passing SvelteKit's `fetch`.** No community Svelte adapter is currently in a healthy state: `trpc-sveltekit` and `trpc-svelte-query-adapter` are still pinned to tRPC v10, and `trpc-svelte-query` supports tRPC v11 but is pinned to `@tanstack/svelte-query` v5, whose Svelte 5 support is the buggy legacy-stores shim — TanStack's Svelte 5 (runes) adapter is `@tanstack/svelte-query` **v6**, which no tRPC wrapper supports yet. The plain client is fully supported by tRPC core, is trivially type-safe against a type-only `AppRouter` import from the API package, and integrates cleanly with SvelteKit's `load`/`fetch` SSR model. If client-side caching/mutations later warrant it, layer `@tanstack/svelte-query@6` on top with plain `queryOptions` wrappers (option b) — no adapter package required.

## Comparison Table

| Axis | (a) trpc-svelte-query (ottomated) | (b) @trpc/client + @tanstack/svelte-query | (c) trpc-sveltekit (icflorescu) | (d) hand-rolled @trpc/client in `load` |
|---|---|---|---|---|
| Latest version (publish date) | 3.0.3 (2025-05-20) | @trpc/client 11.18.0 (2026-06-17); @tanstack/svelte-query 6.1.38 (2026-07-21) | 3.6.3 (2025-03-06); 4.0.0-next.2 (2024-03-05) | @trpc/client 11.18.0 (2026-06-17) |
| tRPC v11 | Yes (peers `@trpc/client ^11`, `@trpc/server ^11`) | Yes (first-party) | **No** — stable peers `^10.0.0`; v11 only via stale `4.0.0-next.2` (peer `^11.0.0-next-beta.286`, Mar 2024) | Yes (first-party) |
| SvelteKit 2 / Svelte 5 | Kit `>=2.20.0 <3`, Svelte `>=5 <6` — but pinned to `@tanstack/svelte-query ^5.69.0` (legacy stores shim on Svelte 5; TanStack calls it "buggy and unreliable"). Open issue #29 asks for the Svelte-5 (v6) adapter | svelte-query v6 peers `svelte ^5.25.0` — the proper runes-based Svelte 5 adapter | Peers `@sveltejs/adapter-node >=1.2` (assumes SvelteKit-hosted server, Node adapter); no Svelte 5 peer declaration | No framework coupling at all; @trpc/client peers only `typescript >=5.7.2` + matching `@trpc/server` |
| SSR / `load` integration | Own SSR/hydration helpers; open bug #30: "hydrateToClient prefetched data map is always empty" (Sep 2025) | You wire prefetch/hydration yourself via QueryClient + `load` | Designed for tRPC served *inside* SvelteKit hooks — wrong architecture for an external Lambda API | Native: call client in universal/server `load`, pass event `fetch`; SvelteKit dedupes/inlines the SSR fetch |
| Maintenance (as of 2026-08-02) | Last release ~14 mo ago; repo pushed 2025-12-01; 74 stars, few issues | Actively maintained by tRPC and TanStack teams | Last release ~17 mo ago; repo pushed 2025-03-06; 15 open issues; v11 branch stalled since Mar 2024 | Rides tRPC core releases only |
| Monorepo type-only `AppRouter` import | Works (generic over router type) | Works | Works but drags v10 types | Works — `createTRPCClient<AppRouter>` needs only `import type` |

`trpc-svelte-query-adapter` (vishalbalaji) also exists (2.3.16, 2025-03-24) but peers `@trpc/client ^10.43.3` — tRPC v10 only, so it is out for a v11 API.

## Per-Option Detail

### (a) `trpc-svelte-query` (ottomated)
- npm: latest **3.0.3**, published 2025-05-20. Peer deps: `@sveltejs/kit >=2.20.0 <3`, `@tanstack/svelte-query ^5.69.0`, `@trpc/client ^11.0.0`, `@trpc/server ^11.0.0`, `svelte >=5 <6` (npm registry).
- The tRPC v11 + Svelte 5 boxes are ticked *on paper*, but the hard pin to TanStack Query **v5** is the problem: TanStack states Svelte 5 works with v5 only through legacy stores compat and has been "buggy and unreliable"; the real Svelte 5 adapter is **v6** (runes, thunk-style options, requires `svelte ^5.25.0`). Open issue [#29 "Svelte 5 Support w/ tanstack query svelte-5-adapter"](https://github.com/ottomated/trpc-svelte-query/issues/29) (Jun 2025) is unresolved, and [#30](https://github.com/ottomated/trpc-svelte-query/issues/30) reports SSR hydration broken in the example (Sep 2025). Last npm release 14+ months ago; small user base (74 stars).

### (b) Plain `@trpc/client` + `@tanstack/svelte-query` v6
- `@tanstack/svelte-query` latest **6.1.38** (2026-07-21), peer `svelte ^5.25.0` — this is the runes rewrite; the v5→v6 migration doc notes options must be passed as thunks (`createQuery(() => opts)`).
- No official tRPC wrapper exists for it (tRPC's first-party TanStack Query integration, `@trpc/tanstack-react-query`, is React-only). The workable pattern is hand-written `queryOptions` factories that call the plain tRPC client — perfectly fine, but it's option (d) plus a caching layer, not an adapter you install.
- Best choice **later** if/when the app needs client-side cache, retries, optimistic mutations.

### (c) `trpc-sveltekit` (icflorescu)
- npm: latest **3.6.3** (2025-03-06) with peers `@trpc/client ^10.0.0`, `@trpc/server ^10.0.0`, `@sveltejs/adapter-node >=1.2`, `ws >=8`. The only v11-ish release is `4.0.0-next.2` from **2024-03-05**, pinned to a v11 *beta* (`^11.0.0-next-beta.286`) — abandoned before v11 stable shipped (Mar 2025 per tRPC releases).
- Architecturally it exists to serve tRPC **from the SvelteKit server** (handle hook + WebSocket support via adapter-node). With the API on AWS Lambda behind API Gateway, that entire value proposition is irrelevant. Repo last pushed 2025-03-06, 15 open issues. **Disqualified twice over** (v10-only and wrong architecture).

### (d) Hand-rolled `@trpc/client` in `load` functions — recommended
- `@trpc/client` / `@trpc/server` latest **11.18.0** (2026-06-17). Peers: `typescript >=5.7.2`; `@trpc/client` requires the exact matching `@trpc/server` version — pin both identically across the monorepo.
- Zero Svelte coupling, so SvelteKit 2 / Svelte 5 compatibility is a non-issue and future SvelteKit majors won't break it.
- SSR story is just SvelteKit's own: build the client per-request with the `fetch` provided to `load`; SvelteKit serializes those fetch responses into the page so the client-side hydration pass doesn't refetch.
- Monorepo type safety: `import type { AppRouter } from '@acme/api'` (type-only, so the API package's runtime deps — including `@trpc/server` internals and any Lambda-only code — never enter the frontend bundle). `createTRPCClient<AppRouter>` gives end-to-end inference. Requirement: shared `typescript >= 5.7.2` and the API package must export the router *type* from its entry (or a dedicated `./router` export).
- In tRPC v11 the data transformer moved off the client root into the link: `httpBatchLink({ transformer: superjson })` — the server sets the same `transformer` in `initTRPC` options. Both sides must match.

## Server Side (brief)

- **tRPC v11 Lambda adapter**: `awsLambdaRequestHandler` from `@trpc/server/adapters/aws-lambda`; handles API Gateway REST (v1) `APIGatewayProxyEvent`, HTTP API (v2) `APIGatewayProxyEventV2`, and Lambda Function URLs. `awsLambdaStreamingRequestHandler` + `awslambda.streamifyResponse()` for streaming (Function URLs / REST API). Note: `httpBatchLink` requires the whole router on a single API Gateway route — use a greedy proxy route like `ANY /trpc/{proxy+}`.
- **SST v3 URL wiring**: define `const api = new sst.aws.ApiGatewayV2("Api")` (routes → the tRPC handler function), then either `link: [api]` on `new sst.aws.SvelteKit("Web", ...)` and read `Resource.Api.url` via the `sst` SDK, or pass `environment: { PUBLIC_TRPC_URL: $interpolate\`${api.url}/trpc\` }`. **Caveat:** the `Resource` SDK is server-side; a tRPC client that also runs in the browser (universal `load`) needs the URL as a *public* Vite/SvelteKit env var — hence the `PUBLIC_`-prefixed `environment` entry (available at `vite build` and under `sst dev`). If you keep all tRPC calls in `+page.server.ts`, `Resource.Api.url` alone is fine and is what SST recommends as more secure.

## Recommended Setup (scaffolding ticket)

### Packages

API package (`packages/api` or `packages/functions`):

```bash
pnpm add @trpc/server@11.18.0 superjson@2.2.6 zod
```

SvelteKit app (`packages/web`):

```bash
pnpm add @trpc/client@11.18.0 @trpc/server@11.18.0 superjson@2.2.6
# @trpc/server is needed at type level and must match @trpc/client exactly
```

(Optional later: `@tanstack/svelte-query@6.1.38` for client-side caching — requires `svelte >= 5.25.0`.)

### API package — router + Lambda handler

```ts
// packages/api/src/router.ts
import { initTRPC } from '@trpc/server';
import superjson from 'superjson';
import { z } from 'zod';

const t = initTRPC.create({ transformer: superjson });

export const appRouter = t.router({
  greet: t.procedure.input(z.object({ name: z.string() })).query(({ input }) => ({
    message: `Hello ${input.name}`,
    at: new Date(), // SuperJSON round-trips Date
  })),
});

export type AppRouter = typeof appRouter;
```

```ts
// packages/api/src/lambda.ts
import { awsLambdaRequestHandler } from '@trpc/server/adapters/aws-lambda';
import { appRouter } from './router';

export const handler = awsLambdaRequestHandler({
  router: appRouter,
  createContext: ({ event, context }) => ({ event, context }),
});
```

Ensure `packages/api/package.json` exposes the type: `"exports": { ".": "./src/index.ts" }` re-exporting `type AppRouter` (or use `"types"`), and the web app depends on it via `"@acme/api": "workspace:*"`.

### SST v3 (`sst.config.ts`)

```ts
const trpcFn = new sst.aws.Function('TrpcFn', {
  handler: 'packages/api/src/lambda.handler',
});
const api = new sst.aws.ApiGatewayV2('Api');
api.route('ANY /trpc/{proxy+}', trpcFn.arn); // single route: required for httpBatchLink

new sst.aws.SvelteKit('Web', {
  path: 'packages/web',
  link: [api], // server-side Resource.Api.url
  environment: {
    PUBLIC_TRPC_URL: $interpolate`${api.url}/trpc`, // browser-visible
  },
});
```

### SvelteKit client factory

```ts
// packages/web/src/lib/trpc.ts
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import { PUBLIC_TRPC_URL } from '$env/static/public';
import type { AppRouter } from '@acme/api'; // type-only: no runtime code pulled in

export function trpc(fetchFn: typeof fetch = fetch) {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: PUBLIC_TRPC_URL,
        transformer: superjson, // v11: transformer lives on the link
        fetch: fetchFn,
      }),
    ],
  });
}
```

### Load-function usage (passing SvelteKit's fetch)

```ts
// packages/web/src/routes/+page.ts  (universal load; SSR + hydration dedupe)
import type { PageLoad } from './$types';
import { trpc } from '$lib/trpc';

export const load: PageLoad = async ({ fetch }) => {
  const greeting = await trpc(fetch).greet.query({ name: 'world' });
  return { greeting };
};
```

Passing `event.fetch` means SSR requests carry cookies/headers per SvelteKit rules and the responses are serialized into the HTML, so the browser does not refetch on hydration. For server-only calls, do the same in `+page.server.ts` — there you may instead build the URL from `Resource.Api.url` (`import { Resource } from 'sst'`) and skip the public env var.

## Sources

- npm registry (versions, publish dates, peer deps; queried 2026-08-02): https://registry.npmjs.org/@trpc/client · https://registry.npmjs.org/@trpc/server · https://registry.npmjs.org/@tanstack/svelte-query · https://registry.npmjs.org/trpc-svelte-query · https://registry.npmjs.org/trpc-svelte-query-adapter · https://registry.npmjs.org/trpc-sveltekit · https://registry.npmjs.org/superjson
- tRPC AWS Lambda adapter (v11): https://trpc.io/docs/server/adapters/aws-lambda
- tRPC vanilla client setup / links: https://trpc.io/docs/client/vanilla/setup
- TanStack Query Svelte adapter (v5 legacy-stores caveat, v6 runes migration): https://tanstack.com/query/v5/docs/framework/svelte/overview · https://tanstack.com/query/v5/docs/framework/svelte/migrate-from-v5-to-v6 · https://github.com/TanStack/query/discussions/7413
- SST v3 SvelteKit component (linking vs environment): https://sst.dev/docs/component/aws/svelte-kit/
- trpc-svelte-query repo + issues (#29 Svelte 5/TSQ-v6, #30 hydration bug): https://github.com/ottomated/trpc-svelte-query · https://github.com/ottomated/trpc-svelte-query/issues
- trpc-sveltekit repo: https://github.com/icflorescu/trpc-sveltekit
- trpc-svelte-query-adapter repo: https://github.com/vishalbalaji/trpc-svelte-query-adapter
- GitHub API repo metadata (pushed_at, open issues; queried 2026-08-02): https://api.github.com/repos/ottomated/trpc-svelte-query · https://api.github.com/repos/icflorescu/trpc-sveltekit · https://api.github.com/repos/vishalbalaji/trpc-svelte-query-adapter
