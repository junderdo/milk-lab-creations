# Allowing a non-prod stage's own CloudFront origin in the API's CORS (SST v3)

Research date: 2026-08-03. Sources: the SST platform source installed in this repo (`.sst/platform`; the v3 "Ion" Pulumi-based architecture), sst.dev docs, Pulumi docs and blog, AWS API Gateway / CloudFront docs, and sst/sst GitHub issues. Repo context: `sst.config.ts`, `apps/api/src/lambda.ts`, `apps/api/src/dev-server.ts`.

Standing constraints (not relitigated here): cross-origin architecture stays; no custom dev subdomains — non-prod keeps random AWS URLs; prod origin is static (`https://milklabcreations.com`); policy knobs will be methods `GET/POST/OPTIONS`, headers `authorization, content-type`, maxAge ~1 day, credentials off.

## Problem restated

`sst.aws.ApiGatewayV2("Api")` wants `cors.allowOrigins` to include the `sst.aws.SvelteKit("Web")` site's CloudFront URL, but `Web` consumes `api.url` (as `PUBLIC_TRPC_URL`, baked into the client bundle at build time). Prod is already solved (both origins are static). The question is only: how does a **non-prod** API allow `http://localhost:5173` plus that stage's own deployed web origin?

## TL;DR

**Recommended: mechanism 2 — set `cors: false` on non-prod and validate the `Origin` header at runtime in the tRPC Lambda, obtaining the web origin via `link: [web]` on the Function.** Contrary to first appearances this creates no cycle: the site depends only on the Api *gateway* resource (`api.apiEndpoint`), routes are separate resources, so the order Api → Web → Function → `api.route(...)` is acyclic. It is correct from the very first deploy of a fresh stage, needs no cross-deploy state, and mirrors the CORS wrapper `apps/api/src/dev-server.ts` already uses locally. Prod keeps gateway-level CORS with its static origin. **Runner-up: mechanism 1 — keep gateway CORS everywhere and late-bind the web origin through an SSM parameter** (write `web.url` on each deploy, read last deploy's value with a data-source lookup); single enforcement path, but the deployed web origin only starts working on the second deploy of a fresh stage.

There is **no SST-native answer**: the canonical issue, [sst/sst#5155](https://github.com/sst/sst/issues/5155), was closed *not planned*, and the only lazy hook SST added (`Function.addEnvironment`) applies to function env vars, not to `ApiGatewayV2`'s `corsConfiguration`.

## Ground truth from SST platform source (local, primary)

All paths under `/home/jeffu/personal/projects/milk-lab-creations/.sst/platform/src/components/` (same code upstream: [apigatewayv2.ts](https://github.com/sst/sst/blob/dev/platform/src/components/aws/apigatewayv2.ts), [ssr-site.ts](https://github.com/sst/sst/blob/dev/platform/src/components/aws/ssr-site.ts), [svelte-kit.ts](https://github.com/sst/sst/blob/dev/platform/src/components/aws/svelte-kit.ts)).

- **CORS accepts Outputs, but is a creation-time input on the Api resource.** `ApiGatewayV2CorsArgs.allowOrigins` is typed `Input<Input<string>[]>`; `normalizeCors()` wraps it in `output(args.cors).apply(...)`; the result is passed as `corsConfiguration` when constructing `aws.apigatewayv2.Api` inside `createApi()`. `cors: false` yields `{}` — no `corsConfiguration` at all. `transform.api` can override `corsConfiguration`, but it runs synchronously at component construction, so it cannot reference a not-yet-declared `web` either.
- **`api.url` (non-domain) is `this.api.apiEndpoint`** — an output of the very resource that carries the CORS config.
- **The web build genuinely blocks on `api.url`.** `base/base-ssr-site.ts` `buildApp()` does `all([sitePath, buildCommand, args.link, args.environment, buildEnvironment]).apply(...)` — the SvelteKit build does not start until `PUBLIC_TRPC_URL` (= `api.url`) resolves, i.e. until the Api resource exists.
- **SvelteKit sites are linkable and expose `url`.** `SvelteKit extends SsrSite`; `SsrSite.getSSTLink()` returns `{ properties: { url: this.url } }`, so `link: [web]` on a Function injects `Resource.Web.url` at runtime. `ApiGatewayV2.getSSTLink()` likewise returns only `{ properties: { url } }` — linking web → api adds no IAM edge, just the url.
- **Non-prod `web.url` resolves to the CloudFront domain URL**: `prodUrl = distribution.domainUrl.apply((d) => d ?? distribution.url)` → `https://dxxxx.cloudfront.net`.
- **SST already uses SSM parameters for cross-deploy state internally** (`aws/vpc.ts` writes and reads `ssm.Parameter` for VPC lookup) — the late-binding idiom of mechanism 1 is established in the platform itself.

## Mechanisms evaluated

### 1. Two-pass apply / late-bound config (SSM parameter or previous outputs)

**How it works.** Break the cycle in time instead of in the graph. Write `web.url` to a well-known SSM parameter each deploy (`new aws.ssm.Parameter(...)`, depending on `web`); the Api's `allowOrigins` reads the **previous** deploy's value via `aws.ssm.getParameterOutput({ name })` — a data-source read that does not depend on the in-program site resource, so the graph stays acyclic. Handle "parameter missing" as "no deployed origin yet". This is the pattern suggested in the [#5155 comments](https://github.com/sst/sst/issues/5155) and the "read the value from the previous deployment, or provide a default if it's the first deployment" pattern from the [Pulumi circular-dependencies blog](https://www.pulumi.com/blog/exploring-circular-dependencies/). Reading the previous deploy's stack outputs (`.sst/outputs.json` / `sst state` before `run()`) is the same idea with more fragile plumbing; `StackReference` is the cross-stack flavor and overkill for a single stack.

**Enforcement:** deploy-time, at the gateway (API Gateway answers preflights; `corsConfiguration` is in-place-updatable, so feeding it a changing value never replaces the API — [AWS HTTP API CORS docs](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-cors.html)).
**Failure modes:** first-ever deploy of a stage has no parameter → that deploy allows only `localhost:5173`; the deployed origin works after the second deploy (a one-time re-deploy, safe forever after per mechanism 4). Stage teardown/recreate repeats the lag; non-prod `removal: "remove"` deletes the parameter with the stage. The read must tolerate absence, not error.
**Complexity:** moderate — SSM write resource, SSM read with missing-parameter fallback, and a comment explaining the two-pass convergence.

### 2. `cors: false` on non-prod + runtime Origin validation in the Lambda (recommended)

**How it works.** For non-prod, pass `cors: false` (no `corsConfiguration` is set — platform source). Without a CORS config, API Gateway routes OPTIONS like any other method: the [AWS HTTP API CORS doc](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-cors.html) confirms catch-all routes receive them ("The `$default` route catches requests for all methods and routes that you haven't explicitly defined, **including OPTIONS requests**"), and `ANY` matches all methods ([HTTP API routes doc](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-develop-routes.html)) — so `ANY /trpc/{proxy+}` receives preflights. Wrap the handler in `apps/api/src/lambda.ts`: short-circuit OPTIONS with 204 + CORS headers **before** tRPC (tRPC's `awsLambdaRequestHandler` does not handle OPTIONS or CORS), and stamp `access-control-allow-origin` (+ `vary: origin`) on real responses when the request Origin is in the allow-set `["http://localhost:5173", Resource.Web.url]`.

**Does `link: [web]` on the Function recreate the cycle? No.** The resource chain is: `Api` gateway (no cors) → `Web` (its build/env needs `api.apiEndpoint`, an output of the gateway resource only) → `trpcFn` (`link: [db, userPool, userPoolClient, web]`) → `api.route("ANY /trpc/{proxy+}", trpcFn.arn)` (routes are separate `ApiGatewayV2LambdaRoute`/integration/permission resources; the Api resource does not depend on them). Acyclic — the Function's dependency on `web.url` rides on the route, not on the gateway. It only requires reordering `sst.config.ts` declarations to Api → Web → Function → route, which is legal since `api.route()` is a method call. (Discussion in [#5155](https://github.com/sst/sst/issues/5155) treats the reverse link as symmetric-cyclic; it is not in this repo, because web's env needs only the gateway's endpoint, not anything downstream of the Function. If a future change made `Web` depend on the *route* or the Function, the fallback is [`Function.addEnvironment`](https://sst.dev/docs/component/aws/function/#addenvironment) — SST's only native lazy hook, "useful for adding environment variables that are only available after the function is created" — at the cost of a plain env var instead of a typed link.)

**Why gateway CORS can't be kept alongside:** "If you configure CORS for an API, API Gateway ignores CORS headers returned from your backend integration" ([AWS HTTP API CORS docs](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-cors.html)) — mixed gateway+Lambda CORS is impossible; it's one or the other per stage.

**Enforcement:** runtime, in the Lambda — every preflight becomes a (cheap) Lambda invocation instead of a gateway-level answer; set `access-control-max-age: 86400` in the wrapper to keep preflights rare.
**Failure modes:** none at first deploy — `Resource.Web.url` is injected once both exist, guaranteed by the ordering above; teardown/recreate is equally safe. Risk shifts to hand-written header code (echo the matched origin, don't reflect arbitrary ones). Prod keeps gateway CORS (static origin), so there are two enforcement paths — or prod can adopt the same runtime path for uniformity.
**Complexity:** moderate — ~20-line wrapper (near-copy of the `dev-server.ts` CORS block, minus the wildcard) + config reorder; zero cross-deploy state.

### 3. Pulumi/SST output tricks ($resolve, apply, transforms, reordering alone)

**Not viable.** `allowOrigins` accepting Outputs doesn't help: `web.url` → `Api.corsConfiguration` plus `Web`'s env → `api.apiEndpoint` is a genuine two-resource cycle, and Pulumi has no mechanism for it — "When you pass an output from one resource as an input to another, Pulumi records that dependency" ([Inputs & Outputs](https://www.pulumi.com/docs/concepts/inputs-outputs/)); a mutual dependency has no valid order. The Pulumi blog on exactly this scenario ("the front-end needs to know the URL of the API to be able to call it and the API needs to know the source domain of the front-end to allow it access via CORS") concludes patch/"update goal state" mechanisms are exploratory and "none are currently implemented in Pulumi SDKs" ([Exploring circular dependencies](https://www.pulumi.com/blog/exploring-circular-dependencies/); also [pulumi/pulumi#3021](https://github.com/pulumi/pulumi/issues/3021), [#5216](https://github.com/pulumi/pulumi/issues/5216)). `apply()`/`$resolve`/`$interpolate` only re-syntax the same edge; `transform.api` runs at construction and can't see a later `web`.

**Does anything force the current declaration ordering?** Only `PUBLIC_TRPC_URL` — the web→api `link` itself carries just `url`, no permissions. And it is **not** breakable via `$interpolate` of a known-ahead URL on non-prod: the non-domain endpoint is `https://{apiId}.execute-api.us-west-2.amazonaws.com` with `{apiId}` generated at creation. (Prod is known ahead — `https://api.milklabcreations.com` — which is why prod already works.) Declaring `Web` first therefore helps only in combination with mechanism 2's route-later trick, not for feeding `web.url` into the gateway's own CORS.

### 4. Are non-prod CloudFront domains stable across deploys? Yes

"When you create a distribution, CloudFront provides a domain name for it, such as d111111abcdef8.cloudfront.net" ([AWS CloudFront CNAMEs doc](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/CNAMEs.html)); it is fixed for the distribution's lifetime. On the provider side, **no input of `aws.cloudfront.Distribution` forces replacement** ([Pulumi registry](https://www.pulumi.com/registry/packages/aws/api-docs/cloudfront/distribution/)) — all changes are in-place. SST's `SsrSite` deploy path updates assets/KV and issues `DistributionInvalidation`s; nothing replaces the distribution. **So per stage the URL is stable until `sst remove`** — which is what makes any one-time-read mechanism sound. The degenerate version: paste the first deploy's `web.url` into a stage→origin map in `sst.config.ts`. Zero moving parts; manual per new stage and silently wrong after a recreate — acceptable only if stages are long-lived and few.

### 5. SST-native answer: none

- [sst/sst#5155 "dealing with circular dependency in sst v3"](https://github.com/sst/sst/issues/5155) is this exact problem class ("the API needs the frontend url and the frontend needs the API url"; a commenter describes the auto-generated-CloudFront-URL variant verbatim). **Closed as not planned.** The only maintainer-offered mechanism is [`Function.addEnvironment`](https://sst.dev/docs/component/aws/function/#addenvironment) — lazy env vars on Functions only; it cannot feed `ApiGatewayV2.corsConfiguration`.
- The [ApiGatewayV2 docs](https://sst.dev/docs/component/aws/apigatewayv2/) and [Linking](https://sst.dev/docs/linking)/[Linkable](https://sst.dev/docs/component/linkable/) docs say nothing about site-URL CORS or reading previous-deploy state; the component's CORS default is a permissive `allowOrigins: ["*"]` (which is presumably why most SST apps never hit this — but a wildcard conflicts with pinned-origin policy, and is incompatible with credentials if that knob ever flips).
- The well-known [fwang circular-dependency gist](https://gist.github.com/fwang/db1e5697913c5533f8b95a4f04464870) uses CDK `Lazy.stringValue` — SST **v2** only; no v3/Pulumi equivalent exists.

## Comparison

| Mechanism | Enforcement | First deploy of a stage | Teardown/recreate | Complexity |
|---|---|---|---|---|
| 1. SSM late-bound origin | Gateway (deploy-time) | Web origin missing until 2nd deploy | One-deploy lag again | Moderate (write + tolerant read) |
| 2. `cors: false` non-prod + runtime check, `link: [web]` | Lambda (runtime) | Correct immediately | Correct immediately | Moderate (~20-line wrapper + reorder) |
| 3. Output tricks / reordering alone | — | — | — | Not viable (true resource cycle) |
| 4. Hardcoded per-stage literal (stable CF domain) | Gateway (deploy-time) | Manual paste after 1st deploy | Manual re-paste | Trivial but manual, drift-prone |
| 5. SST-native | — | — | — | Does not exist (#5155 closed not planned) |

## Recommendation

**Primary: mechanism 2.** Reorder `sst.config.ts` to Api → Web → `trpcFn` (`link: [..., web]`) → `api.route(...)`; set `cors: isProd ? {…static policy…} : false`; wrap the Lambda handler to answer OPTIONS and stamp `access-control-allow-origin` for `http://localhost:5173` and `Resource.Web.url` (methods GET/POST/OPTIONS, headers authorization+content-type, max-age 86400, no credentials). It is deterministic on the first deploy of any fresh stage, carries no cross-deploy state, and the repo already maintains the identical wrapper in `dev-server.ts`. The known trade-offs: preflights invoke the Lambda (mitigated by max-age), and prod/non-prod enforce CORS in different places.

**Runner-up: mechanism 1 (SSM late-binding)** if gateway-level enforcement on every stage is worth a one-deploy lag on fresh stages: write `web.url` to `/milk-lab-creations/{stage}/web-origin` after the site deploys, read it (tolerating absence) into `allowOrigins` alongside `localhost:5173`. Mechanism 4's stability finding guarantees the parameter never goes stale between recreates.

## Sources

- Local SST platform source: `.sst/platform/src/components/aws/apigatewayv2.ts`, `aws/ssr-site.ts`, `aws/svelte-kit.ts`, `base/base-ssr-site.ts`, `aws/vpc.ts`, `aws/cdn.ts` (upstream: [apigatewayv2.ts](https://github.com/sst/sst/blob/dev/platform/src/components/aws/apigatewayv2.ts), [ssr-site.ts](https://github.com/sst/sst/blob/dev/platform/src/components/aws/ssr-site.ts), [svelte-kit.ts](https://github.com/sst/sst/blob/dev/platform/src/components/aws/svelte-kit.ts))
- SST docs: [ApiGatewayV2](https://sst.dev/docs/component/aws/apigatewayv2/) · [Linking](https://sst.dev/docs/linking) · [Linkable](https://sst.dev/docs/component/linkable/) · [Function.addEnvironment](https://sst.dev/docs/component/aws/function/#addenvironment)
- SST issues: [sst/sst#5155](https://github.com/sst/sst/issues/5155) (closed not planned) · [fwang v2/CDK gist](https://gist.github.com/fwang/db1e5697913c5533f8b95a4f04464870)
- Pulumi: [Inputs & Outputs](https://www.pulumi.com/docs/concepts/inputs-outputs/) · [Exploring circular dependencies](https://www.pulumi.com/blog/exploring-circular-dependencies/) · [pulumi/pulumi#3021](https://github.com/pulumi/pulumi/issues/3021) · [pulumi/pulumi#5216](https://github.com/pulumi/pulumi/issues/5216) · [aws.cloudfront.Distribution](https://www.pulumi.com/registry/packages/aws/api-docs/cloudfront/distribution/)
- AWS: [HTTP API CORS](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-cors.html) · [HTTP API routes](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-develop-routes.html) · [CloudFront CNAMEs/domain names](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/CNAMEs.html)
