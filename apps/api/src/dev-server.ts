// Local stand-in for API Gateway + Lambda; runs under `sst dev` with the
// linked Db/UserPool env injected. `pnpm dev:server` then point
// PUBLIC_TRPC_URL at http://localhost:3001/trpc
import { createHTTPServer } from "@trpc/server/adapters/standalone";
import { fetchProfile, verifyBearer } from "./auth.ts";
import type { Context } from "./context.ts";
import { getDb } from "./db.ts";
import { appRouter } from "./router.ts";

const port = Number(process.env.PORT ?? 3001);

createHTTPServer({
  router: appRouter,
  basePath: "/trpc/",
  createContext: async ({ req }): Promise<Context> => ({
    db: getDb(),
    user: await verifyBearer(req.headers.authorization),
    fetchProfile,
  }),
  // SvelteKit's load fetch enforces CORS server-side; API Gateway handles this in prod
  responseMeta: () => ({
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "authorization, content-type",
    },
  }),
}).listen(port);

console.log(`tRPC dev server listening on http://localhost:${port}/trpc`);
