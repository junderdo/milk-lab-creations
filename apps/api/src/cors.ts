// Stage-aware CORS. Production's API Gateway carries a static allow-origin at
// the edge and this module stays inert there; non-prod stages set cors:false on
// the gateway and validate the Origin here instead, because a fresh stage's own
// web origin is only knowable at deploy time (it is linked into the function).
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
  Context as LambdaContext,
} from "aws-lambda";
import { Resource } from "sst";

/** The vite dev server every stage's browser session may come from. */
export const LOCAL_WEB_ORIGIN = "http://localhost:5173";

/** Production's only browser origin; enforced at the gateway, never here. */
export const PROD_WEB_ORIGIN = "https://milklabcreations.com";

/** Preflight cache lifetime; keeps OPTIONS off the Lambda for a day. */
const MAX_AGE_SECONDS = 86_400;

const POLICY = {
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-max-age": String(MAX_AGE_SECONDS),
  // no access-control-allow-credentials: auth travels as a bearer header
} as const;

/**
 * The origins this deployment enforces at runtime. Empty means "not our job" —
 * production, where the gateway answers preflights before we are invoked.
 *
 * @param linkedWebUrl the stage's own web url, absent when web is not linked.
 */
export function allowedOriginsFor(linkedWebUrl: string | undefined): string[] {
  if (!linkedWebUrl) return [];
  const webOrigin = linkedWebUrl.replace(/\/+$/, "");
  // production is the gateway's job either way, so a web link that ever lands
  // on the production function can't quietly start granting localhost there
  if (webOrigin === PROD_WEB_ORIGIN) return [];
  return [LOCAL_WEB_ORIGIN, webOrigin];
}

/** Reads the linked web origin injected by `link: [web]` on non-prod stages. */
export function allowedOrigins(): string[] {
  return allowedOriginsFor("Web" in Resource ? Resource.Web.url : undefined);
}

/**
 * CORS response headers for a request from `origin`. Empty when no runtime
 * origins are enforced; otherwise `vary: origin` always, and the grant only
 * for an exact allow-list match.
 */
export function corsHeaders(
  origin: string | undefined,
  allowed: readonly string[],
): Record<string, string> {
  if (allowed.length === 0) return {};
  if (origin === undefined || !allowed.includes(origin)) return { vary: "origin" };
  return { "access-control-allow-origin": origin, ...POLICY, vary: "origin" };
}

type LambdaHandler = (
  event: APIGatewayProxyEventV2,
  context: LambdaContext,
) => Promise<APIGatewayProxyStructuredResultV2>;

/**
 * Enforces `allowed` around a Lambda handler: answers preflights and stamps the
 * grant on real responses. A no-op when `allowed` is empty, so production keeps
 * answering preflights at the gateway edge.
 */
export function withCors(inner: LambdaHandler, allowed: readonly string[]): LambdaHandler {
  if (allowed.length === 0) return inner;
  return async (event, context) => {
    const headers = corsHeaders(event.headers?.origin ?? event.headers?.Origin, allowed);
    if (event.requestContext.http.method === "OPTIONS") return { statusCode: 204, headers };
    const result = await inner(event, context);
    return { ...result, headers: { ...result.headers, ...headers } };
  };
}
