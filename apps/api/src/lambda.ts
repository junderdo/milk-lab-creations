import { awsLambdaRequestHandler } from "@trpc/server/adapters/aws-lambda";
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { fetchProfile, verifyBearer } from "./auth.ts";
import type { Context } from "./context.ts";
import { allowedOrigins, withCors } from "./cors.ts";
import { getDb } from "./db.ts";
import { appRouter } from "./router.ts";

const trpcHandler = awsLambdaRequestHandler<typeof appRouter, APIGatewayProxyEventV2>({
  router: appRouter,
  createContext: async ({ event }): Promise<Context> => ({
    db: getDb(),
    user: await verifyBearer(event.headers?.authorization ?? event.headers?.Authorization),
    fetchProfile,
  }),
});

// the Lambda owns CORS on every stage, production included: the greedy route
// matches OPTIONS, so the gateway never sees a preflight (see ./cors.ts)
export const handler = withCors(trpcHandler, allowedOrigins());
