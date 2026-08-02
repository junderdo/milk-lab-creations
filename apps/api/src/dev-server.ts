// Local stand-in for API Gateway + Lambda; `pnpm dev:server` then point
// PUBLIC_TRPC_URL at http://localhost:3001/trpc
import { createHTTPServer } from "@trpc/server/adapters/standalone";
import { appRouter } from "./router.ts";

const port = Number(process.env.PORT ?? 3001);

createHTTPServer({
  router: appRouter,
  basePath: "/trpc/",
  // SvelteKit's load fetch enforces CORS server-side; API Gateway handles this in prod
  responseMeta: () => ({ headers: { "access-control-allow-origin": "*" } }),
}).listen(port);

console.log(`tRPC dev server listening on http://localhost:${port}/trpc`);
