import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { awsLambdaRequestHandler } from "@trpc/server/adapters/aws-lambda";
import { fetchProfile, verifyBearer } from "./auth.ts";
import { allowedOrigins, withCors } from "./cors.ts";
import type { Context } from "./context.ts";
import { getDb } from "./db.ts";
import { appRouter } from "./router.ts";

const trpc = awsLambdaRequestHandler<typeof appRouter, APIGatewayProxyEventV2>({
  router: appRouter,
  createContext: async ({ event }): Promise<Context> => ({
    db: getDb(),
    user: await verifyBearer(event.headers?.authorization ?? event.headers?.Authorization),
    fetchProfile,
  }),
});

// no-op on production, where the gateway answers preflights at the edge
export const handler = withCors(trpc, allowedOrigins());
