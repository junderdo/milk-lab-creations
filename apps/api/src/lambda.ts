import { awsLambdaRequestHandler } from "@trpc/server/adapters/aws-lambda";
import { fetchProfile, verifyBearer } from "./auth.ts";
import type { Context } from "./context.ts";
import { getDb } from "./db.ts";
import { appRouter } from "./router.ts";

export const handler = awsLambdaRequestHandler({
  router: appRouter,
  createContext: async ({ event }): Promise<Context> => ({
    db: getDb(),
    user: await verifyBearer(event.headers?.authorization ?? event.headers?.Authorization),
    fetchProfile,
  }),
});
