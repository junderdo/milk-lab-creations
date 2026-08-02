import { awsLambdaRequestHandler } from "@trpc/server/adapters/aws-lambda";
import { appRouter } from "./router.ts";

export const handler = awsLambdaRequestHandler({
  router: appRouter,
  createContext: ({ event, context }) => ({ event, context }),
});
