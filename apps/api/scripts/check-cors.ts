// Stage-agnostic CORS check: drives a deployed API's real preflight and real
// request paths the way a browser would, and asserts the answers a browser
// requires. Runnable against any stage — nothing here knows about a stage
// beyond the two flags.
//
//   pnpm --filter @milklab/api check:cors \
//     --api-url https://api.milklabcreations.com \
//     --origin https://milklabcreations.com
//
// Repeat --origin for every origin the stage is supposed to allow (a dev stage
// allows both its own web origin and http://localhost:5173). Exits non-zero if
// any check fails.

export {}; // top-level await needs this file to be a module

/** A public query: reachable without a token, so the check needs no auth. */
const DEFAULT_PATH = "/trpc/robots.list";

/** Stands in for any origin the API must never grant. */
const DISALLOWED_ORIGIN = "https://evil.example.com";

/** The headers the web client actually sends (see apps/web/src/lib/trpc.ts). */
const REQUEST_HEADERS = "authorization,content-type";

/** The methods httpBatchLink uses: GET for queries, POST for mutations. */
const REQUIRED_METHODS = ["GET", "POST"];

type Result = { ok: boolean; label: string; detail: string };

function parseArgs(argv: string[]) {
  let apiUrl: string | undefined;
  let path = DEFAULT_PATH;
  const origins: string[] = [];
  for (let i = 0; i < argv.length; i += 2) {
    const [flag, value] = [argv[i], argv[i + 1]];
    if (value === undefined) throw new Error(`missing value for ${flag}`);
    if (flag === "--api-url") apiUrl = value;
    else if (flag === "--origin") origins.push(value);
    else if (flag === "--path") path = value;
    else throw new Error(`unknown flag ${flag}`);
  }
  if (!apiUrl || origins.length === 0) {
    throw new Error("usage: --api-url <url> --origin <origin> [--origin <origin>] [--path <path>]");
  }
  return { url: apiUrl.replace(/\/+$/, "") + path, origins };
}

/** Case-insensitive comma list membership, e.g. "GET,OPTIONS,POST". */
function listIncludes(header: string | null, needle: string): boolean {
  return (header ?? "")
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .includes(needle.toLowerCase());
}

function check(label: string, ok: boolean, detail: string): Result {
  return { ok, label, detail };
}

/** The preflight a browser sends before any authorized or JSON request. */
async function preflight(url: string, origin: string): Promise<Response> {
  return fetch(url, {
    method: "OPTIONS",
    headers: {
      origin,
      "access-control-request-method": "POST",
      "access-control-request-headers": REQUEST_HEADERS,
    },
  });
}

async function checkAllowedOrigin(url: string, origin: string): Promise<Result[]> {
  const results: Result[] = [];
  const res = await preflight(url, origin);
  const allowOrigin = res.headers.get("access-control-allow-origin");

  // A browser fails the preflight on any non-2xx, whatever headers came with
  // it — this is what a greedy ANY route silently breaks.
  results.push(
    check(
      `preflight ${origin} → 2xx`,
      res.status >= 200 && res.status < 300,
      `status ${res.status}`,
    ),
  );
  results.push(
    check(
      `preflight ${origin} → allow-origin echoed`,
      allowOrigin === origin,
      `access-control-allow-origin: ${allowOrigin ?? "(absent)"}`,
    ),
  );
  for (const method of REQUIRED_METHODS) {
    const methods = res.headers.get("access-control-allow-methods");
    results.push(
      check(
        `preflight ${origin} → allows ${method}`,
        listIncludes(methods, method),
        `access-control-allow-methods: ${methods ?? "(absent)"}`,
      ),
    );
  }
  for (const header of REQUEST_HEADERS.split(",")) {
    const allowHeaders = res.headers.get("access-control-allow-headers");
    results.push(
      check(
        `preflight ${origin} → allows ${header} header`,
        listIncludes(allowHeaders, header),
        `access-control-allow-headers: ${allowHeaders ?? "(absent)"}`,
      ),
    );
  }
  const maxAge = res.headers.get("access-control-max-age");
  results.push(
    check(
      `preflight ${origin} → caches the preflight`,
      Number(maxAge) > 0,
      `access-control-max-age: ${maxAge ?? "(absent)"}`,
    ),
  );
  // Without vary:origin a shared cache can hand one origin's grant to another.
  results.push(
    check(
      `preflight ${origin} → varies on origin`,
      listIncludes(res.headers.get("vary"), "origin"),
      `vary: ${res.headers.get("vary") ?? "(absent)"}`,
    ),
  );
  // Auth travels as a bearer header, so credentials must never be granted.
  const credentials = res.headers.get("access-control-allow-credentials");
  results.push(
    check(
      `preflight ${origin} → no credentials grant`,
      credentials === null || credentials.toLowerCase() === "false",
      `access-control-allow-credentials: ${credentials ?? "(absent)"}`,
    ),
  );

  const real = await fetch(url, { headers: { origin } });
  results.push(
    check(
      `request ${origin} → allow-origin echoed`,
      real.headers.get("access-control-allow-origin") === origin,
      `status ${real.status}, access-control-allow-origin: ${
        real.headers.get("access-control-allow-origin") ?? "(absent)"
      }`,
    ),
  );
  results.push(
    check(
      `request ${origin} → varies on origin`,
      listIncludes(real.headers.get("vary"), "origin"),
      `vary: ${real.headers.get("vary") ?? "(absent)"}`,
    ),
  );
  return results;
}

async function checkDisallowedOrigin(url: string): Promise<Result[]> {
  const origin = DISALLOWED_ORIGIN;
  const granted = (res: Response) => {
    const allow = res.headers.get("access-control-allow-origin");
    return allow === origin || allow === "*";
  };
  const pre = await preflight(url, origin);
  const real = await fetch(url, { headers: { origin } });
  return [
    check(
      `preflight ${origin} → not granted`,
      !granted(pre),
      `access-control-allow-origin: ${pre.headers.get("access-control-allow-origin") ?? "(absent)"}`,
    ),
    check(
      `request ${origin} → not granted`,
      !granted(real),
      `access-control-allow-origin: ${
        real.headers.get("access-control-allow-origin") ?? "(absent)"
      }`,
    ),
  ];
}

const { url, origins } = parseArgs(process.argv.slice(2));
console.log(`CORS check → ${url}\n`);

const results: Result[] = [];
for (const origin of origins) results.push(...(await checkAllowedOrigin(url, origin)));
results.push(...(await checkDisallowedOrigin(url)));

for (const { ok, label, detail } of results) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}\n        ${detail}`);
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed === 0 ? 0 : 1);
