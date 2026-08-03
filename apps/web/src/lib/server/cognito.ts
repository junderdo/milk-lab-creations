// Server-side Cognito OAuth helpers: direct-to-Google authorize URL, code
// exchange, refresh, and the httpOnly cookie session. The user pool client is
// a public client (no secret) — exchange is authenticated by redirect_uri.
import { env } from "$env/dynamic/public";
import type { Cookies } from "@sveltejs/kit";

const REFRESH_COOKIE = "milklab_refresh";
const ACCESS_COOKIE = "milklab_access";

function domain() {
  return `https://${env.PUBLIC_COGNITO_DOMAIN}`;
}

function clientId() {
  return env.PUBLIC_COGNITO_CLIENT_ID ?? "";
}

export function authorizeUrl(origin: string): string {
  const params = new URLSearchParams({
    client_id: clientId(),
    response_type: "code",
    scope: "openid email profile",
    redirect_uri: `${origin}/auth/callback`,
    identity_provider: "Google", // straight to Google; no Cognito hosted page
  });
  return `${domain()}/oauth2/authorize?${params}`;
}

export function logoutUrl(origin: string): string {
  const params = new URLSearchParams({
    client_id: clientId(),
    logout_uri: origin,
  });
  return `${domain()}/logout?${params}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse | null> {
  const response = await fetch(`${domain()}/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId(), ...body }),
  });
  if (!response.ok) return null;
  return (await response.json()) as TokenResponse;
}

export async function exchangeCode(origin: string, code: string) {
  return tokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: `${origin}/auth/callback`,
  });
}

export async function refreshTokens(refreshToken: string) {
  return tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
}

export function storeSession(cookies: Cookies, tokens: TokenResponse) {
  if (tokens.refresh_token) {
    cookies.set(REFRESH_COOKIE, tokens.refresh_token, {
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 90 * 24 * 60 * 60, // matches the client's refresh token validity
    });
  }
  // short-lived cache so SSR loads don't hit the token endpoint every request;
  // expires before the ~1h access token itself does
  cookies.set(ACCESS_COOKIE, tokens.access_token, {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: Math.max(60, tokens.expires_in - 300),
  });
}

export function clearSession(cookies: Cookies) {
  cookies.delete(REFRESH_COOKIE, { path: "/" });
  cookies.delete(ACCESS_COOKIE, { path: "/" });
}

/** Current access token, transparently refreshed from the refresh cookie. */
export async function getAccessToken(cookies: Cookies): Promise<string | null> {
  const cached = cookies.get(ACCESS_COOKIE);
  if (cached) return cached;

  const refreshToken = cookies.get(REFRESH_COOKIE);
  if (!refreshToken) return null;

  const tokens = await refreshTokens(refreshToken);
  if (!tokens) {
    clearSession(cookies);
    return null;
  }
  storeSession(cookies, tokens);
  return tokens.access_token;
}
