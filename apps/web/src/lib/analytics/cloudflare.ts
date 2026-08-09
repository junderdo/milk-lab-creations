/**
 * The Cloudflare Web Analytics beacon, as a tag for the page shell.
 *
 * The site is served from CloudFront rather than proxied through Cloudflare,
 * so the JS beacon is the only way it reports. Stages that set no token — dev,
 * and every personal stage — emit nothing rather than pollute the numbers.
 */

/** Cloudflare's tokens are 32 hex characters; anything else is a misconfiguration. */
const TOKEN_PATTERN = /^[0-9a-f]{32}$/i;

export function cloudflareBeaconTag(token: string | undefined): string {
  const trimmed = token?.trim();
  if (!trimmed || !TOKEN_PATTERN.test(trimmed)) return "";
  return `<script type="module" src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "${trimmed}"}'></script>`;
}
