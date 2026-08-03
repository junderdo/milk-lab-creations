// Local stand-in for API Gateway + Lambda; runs under `sst dev` with the
// linked Db/UserPool env injected. `pnpm dev:server` then point
// PUBLIC_TRPC_URL at http://localhost:3001/trpc
import { createServer } from "node:http";
import { createHTTPHandler } from "@trpc/server/adapters/standalone";
import { fetchProfile, verifyBearer } from "./auth.ts";
import type { Context } from "./context.ts";
import { getDb } from "./db.ts";
import { appRouter } from "./router.ts";

const port = Number(process.env.PORT ?? 3001);

const handler = createHTTPHandler({
  router: appRouter,
  basePath: "/trpc/",
  createContext: async ({ req }): Promise<Context> => ({
    db: getDb(),
    user: await verifyBearer(req.headers.authorization),
    fetchProfile,
  }),
});

// Browser CORS, including the preflight that authorized requests trigger;
// API Gateway handles this in prod
createServer((req, res) => {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-headers", "authorization, content-type");
  res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  handler(req, res);
}).listen(port);

console.log(`tRPC dev server listening on http://localhost:${port}/trpc`);
