import type { APIGatewayProxyEventV2, Context as LambdaContext } from "aws-lambda";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LOCAL_WEB_ORIGIN,
  PROD_WEB_ORIGIN,
  corsHeaders,
  parseAllowedOrigins,
  withCors,
} from "../src/cors.ts";

const STAGE_WEB_ORIGIN = "https://d111111abcdef8.cloudfront.net";
const ALLOWED = [LOCAL_WEB_ORIGIN, STAGE_WEB_ORIGIN];

function event(method: string, headers: Record<string, string>): APIGatewayProxyEventV2 {
  return {
    headers,
    requestContext: { http: { method } },
  } as unknown as APIGatewayProxyEventV2;
}

const lambdaContext = {} as LambdaContext;

describe("parseAllowedOrigins", () => {
  it("enforces nothing when the stage configured no origins", () => {
    expect(parseAllowedOrigins(undefined)).toEqual([]);
    expect(parseAllowedOrigins("")).toEqual([]);
  });

  it("reads a dev stage's pair: the local dev origin plus the stage's own web origin", () => {
    expect(parseAllowedOrigins(`${LOCAL_WEB_ORIGIN},${STAGE_WEB_ORIGIN}`)).toEqual([
      LOCAL_WEB_ORIGIN,
      STAGE_WEB_ORIGIN,
    ]);
  });

  it("reads production's single origin", () => {
    expect(parseAllowedOrigins(PROD_WEB_ORIGIN)).toEqual([PROD_WEB_ORIGIN]);
  });

  it("normalizes a trailing slash off a deploy-time url so it matches an Origin header", () => {
    expect(parseAllowedOrigins(`${STAGE_WEB_ORIGIN}/`)).toEqual([STAGE_WEB_ORIGIN]);
  });

  it("tolerates whitespace and empty entries from interpolated config", () => {
    expect(parseAllowedOrigins(` ${LOCAL_WEB_ORIGIN} , , ${STAGE_WEB_ORIGIN} ,`)).toEqual([
      LOCAL_WEB_ORIGIN,
      STAGE_WEB_ORIGIN,
    ]);
  });

  it("drops the local dev origin whenever production's origin is present, whatever config says", () => {
    expect(parseAllowedOrigins(`${LOCAL_WEB_ORIGIN},${PROD_WEB_ORIGIN}`)).toEqual([
      PROD_WEB_ORIGIN,
    ]);
  });
});

describe("corsHeaders", () => {
  it("adds nothing when there are no runtime-allowed origins", () => {
    expect(corsHeaders(LOCAL_WEB_ORIGIN, [])).toEqual({});
  });

  it("echoes an allowed origin with the tight policy knobs", () => {
    expect(corsHeaders(STAGE_WEB_ORIGIN, ALLOWED)).toEqual({
      "access-control-allow-origin": STAGE_WEB_ORIGIN,
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "authorization, content-type",
      "access-control-max-age": "86400",
      vary: "origin",
    });
  });

  it("allows the local dev origin", () => {
    expect(corsHeaders(LOCAL_WEB_ORIGIN, ALLOWED)["access-control-allow-origin"]).toBe(
      LOCAL_WEB_ORIGIN,
    );
  });

  it("never allows credentials", () => {
    expect(corsHeaders(STAGE_WEB_ORIGIN, ALLOWED)).not.toHaveProperty(
      "access-control-allow-credentials",
    );
  });

  it("varies on origin but grants nothing to an unknown origin", () => {
    expect(corsHeaders("https://evil.example.com", ALLOWED)).toEqual({ vary: "origin" });
  });

  it("varies on origin for a request that sends none", () => {
    expect(corsHeaders(undefined, ALLOWED)).toEqual({ vary: "origin" });
  });

  it.each([
    "http://localhost:5173.evil.example.com",
    "https://localhost:5173",
    "http://localhost:5174",
    "http://localhost",
    `${STAGE_WEB_ORIGIN}.evil.example.com`,
    `evil.${STAGE_WEB_ORIGIN}`,
    `${STAGE_WEB_ORIGIN}/`,
    "null",
  ])("matches origins exactly, so it rejects %s", (origin) => {
    expect(corsHeaders(origin, ALLOWED)).toEqual({ vary: "origin" });
  });
});

describe("withCors", () => {
  const ok = () =>
    vi.fn(async () => ({ statusCode: 200, body: "{}", headers: { "content-type": "text/plain" } }));

  it("answers an allowed preflight itself, without invoking the router", async () => {
    const inner = ok();
    const res = await withCors(inner, ALLOWED)(
      event("OPTIONS", { origin: STAGE_WEB_ORIGIN }),
      lambdaContext,
    );
    expect(inner).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(204);
    expect(res.headers).toEqual(corsHeaders(STAGE_WEB_ORIGIN, ALLOWED));
  });

  it("answers a preflight from an unknown origin without granting it anything", async () => {
    const inner = ok();
    const res = await withCors(inner, ALLOWED)(
      event("OPTIONS", { origin: "https://evil.example.com" }),
      lambdaContext,
    );
    expect(inner).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(204);
    expect(res.headers).not.toHaveProperty("access-control-allow-origin");
  });

  it("stamps the grant on a real response and keeps the router's own headers", async () => {
    const res = await withCors(ok(), ALLOWED)(
      event("POST", { origin: LOCAL_WEB_ORIGIN }),
      lambdaContext,
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe("{}");
    expect(res.headers).toMatchObject({
      "content-type": "text/plain",
      "access-control-allow-origin": LOCAL_WEB_ORIGIN,
      vary: "origin",
    });
  });

  it("serves an unknown origin's request but withholds the grant, so the browser blocks it", async () => {
    const inner = ok();
    const res = await withCors(inner, ALLOWED)(
      event("POST", { Origin: "https://evil.example.com" }),
      lambdaContext,
    );
    expect(inner).toHaveBeenCalled();
    expect(res.headers).not.toHaveProperty("access-control-allow-origin");
  });

  it("unions vary with the router's own, so caches keep tRPC's content negotiation", async () => {
    const inner = vi.fn(async () => ({
      statusCode: 200,
      headers: { vary: "trpc-accept, accept" },
    }));
    const res = await withCors(inner, ALLOWED)(
      event("POST", { origin: LOCAL_WEB_ORIGIN }),
      lambdaContext,
    );
    expect(res.headers?.vary).toBe("trpc-accept, accept, origin");
  });

  it("reads a capitalized Origin header", async () => {
    const res = await withCors(ok(), ALLOWED)(
      event("POST", { Origin: STAGE_WEB_ORIGIN }),
      lambdaContext,
    );
    expect(res.headers?.["access-control-allow-origin"]).toBe(STAGE_WEB_ORIGIN);
  });

  it("stays out of the way when a stage configured no origins, preflights included", async () => {
    const inner = ok();
    const wrapped = withCors(inner, []);
    const post = await wrapped(event("POST", { origin: LOCAL_WEB_ORIGIN }), lambdaContext);
    expect(post.headers).toEqual({ "content-type": "text/plain" });

    await wrapped(event("OPTIONS", { origin: LOCAL_WEB_ORIGIN }), lambdaContext);
    expect(inner).toHaveBeenCalledTimes(2);
  });
});

// The bug this suite exists to prevent was never in cors.ts: it was that the
// deployed preflight reached tRPC and came back 415, which a browser treats as
// a failed preflight. These drive the real exported handler, so a regression in
// the wiring — not just the policy — fails here.
describe("the deployed lambda handler", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllEnvs());

  async function handlerWithOrigins(origins: string) {
    vi.stubEnv("ALLOWED_WEB_ORIGINS", origins);
    return (await import("../src/lambda.ts")).handler;
  }

  it("answers a production preflight itself, 2xx, without reaching tRPC", async () => {
    const handler = await handlerWithOrigins(PROD_WEB_ORIGIN);
    const res = await handler(event("OPTIONS", { origin: PROD_WEB_ORIGIN }), lambdaContext);
    expect(res.statusCode).toBe(204);
    expect(res.headers?.["access-control-allow-origin"]).toBe(PROD_WEB_ORIGIN);
    expect(res.headers?.["access-control-allow-headers"]).toContain("authorization");
  });

  it("never grants production to the local dev origin", async () => {
    const handler = await handlerWithOrigins(`${LOCAL_WEB_ORIGIN},${PROD_WEB_ORIGIN}`);
    const res = await handler(event("OPTIONS", { origin: LOCAL_WEB_ORIGIN }), lambdaContext);
    expect(res.headers).not.toHaveProperty("access-control-allow-origin");
  });

  it("answers a dev stage preflight for both the stage origin and localhost", async () => {
    const handler = await handlerWithOrigins(`${LOCAL_WEB_ORIGIN},${STAGE_WEB_ORIGIN}`);
    for (const origin of [LOCAL_WEB_ORIGIN, STAGE_WEB_ORIGIN]) {
      const res = await handler(event("OPTIONS", { origin }), lambdaContext);
      expect(res.statusCode).toBe(204);
      expect(res.headers?.["access-control-allow-origin"]).toBe(origin);
    }
  });

  it("answers an unknown origin's preflight without granting it", async () => {
    const handler = await handlerWithOrigins(PROD_WEB_ORIGIN);
    const res = await handler(
      event("OPTIONS", { origin: "https://evil.example.com" }),
      lambdaContext,
    );
    expect(res.statusCode).toBe(204);
    expect(res.headers).not.toHaveProperty("access-control-allow-origin");
  });
});
