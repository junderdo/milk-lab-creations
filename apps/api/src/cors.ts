// Stage-aware CORS, owned by the Lambda on every stage including production.
//
// The gateway cannot own it: the router needs one greedy `ANY /trpc/{proxy+}`
// route, that route matches OPTIONS, and a matching route beats API Gateway's
// automatic preflight handling. Preflights therefore reached tRPC, which
// answered 415 — a failed preflight in every browser. So the gateway sets
// cors:false everywhere and the policy lives here, where it is testable and
// identical on every stage.
//
// The origins come from ALLOWED_WEB_ORIGINS, set per stage in sst.config.ts:
// production's is the static custom domain, a dev stage's own web origin is
// only knowable at deploy time.
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
  Context as LambdaContext,
} from "aws-lambda";

/** The vite dev server every stage's browser session may come from. */
export const LOCAL_WEB_ORIGIN = "http://localhost:5173";

/** Production's only browser origin. */
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
 * The origins this deployment enforces, parsed from a comma-separated list.
 * Empty means enforce nothing, which only happens if a stage sets no list.
 *
 * @param raw the stage's ALLOWED_WEB_ORIGINS value.
 */
export function parseAllowedOrigins(raw: string | undefined): string[] {
  const origins = (raw ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter((origin) => origin.length > 0);
  // belt and braces: production's list is written statically in sst.config.ts,
  // but no misconfiguration should ever hand the live site's API to localhost
  if (origins.includes(PROD_WEB_ORIGIN)) {
    return origins.filter((origin) => origin !== LOCAL_WEB_ORIGIN);
  }
  return origins;
}

/** Reads the per-stage origin list injected by sst.config.ts. */
export function allowedOrigins(): string[] {
  return parseAllowedOrigins(process.env.ALLOWED_WEB_ORIGINS);
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
 * grant on real responses. A no-op when `allowed` is empty, which is only a
 * stage that configured no origins.
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
