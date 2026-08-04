import type { APIGatewayProxyEventV2, Context as LambdaContext } from "aws-lambda";
import { describe, expect, it, vi } from "vitest";
import {
  LOCAL_WEB_ORIGIN,
  PROD_WEB_ORIGIN,
  allowedOriginsFor,
  corsHeaders,
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

describe("allowedOriginsFor", () => {
  it("returns no origins when the stage has no linked web origin (production: the gateway owns CORS)", () => {
    expect(allowedOriginsFor(undefined)).toEqual([]);
  });

  it("allows the local dev origin plus the stage's own web origin", () => {
    expect(allowedOriginsFor(STAGE_WEB_ORIGIN)).toEqual([LOCAL_WEB_ORIGIN, STAGE_WEB_ORIGIN]);
  });

  it("normalizes a trailing slash off the linked url so it matches an Origin header", () => {
    expect(allowedOriginsFor(`${STAGE_WEB_ORIGIN}/`)).toEqual([LOCAL_WEB_ORIGIN, STAGE_WEB_ORIGIN]);
  });

  it("stays inert if it is ever linked to production's web, which must never allow localhost", () => {
    expect(allowedOriginsFor(PROD_WEB_ORIGIN)).toEqual([]);
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

  it("reads a capitalized Origin header", async () => {
    const res = await withCors(ok(), ALLOWED)(
      event("POST", { Origin: STAGE_WEB_ORIGIN }),
      lambdaContext,
    );
    expect(res.headers?.["access-control-allow-origin"]).toBe(STAGE_WEB_ORIGIN);
  });

  it("stays out of the way where the gateway owns CORS, preflights included", async () => {
    const inner = ok();
    const wrapped = withCors(inner, []);
    const post = await wrapped(event("POST", { origin: LOCAL_WEB_ORIGIN }), lambdaContext);
    expect(post.headers).toEqual({ "content-type": "text/plain" });

    await wrapped(event("OPTIONS", { origin: LOCAL_WEB_ORIGIN }), lambdaContext);
    expect(inner).toHaveBeenCalledTimes(2);
  });
});
