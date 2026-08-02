/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "milk-lab-creations",
      removal: input?.stage === "production" ? "retain" : "remove",
      home: "aws",
      providers: {
        aws: {
          region: "us-west-2",
          // CI authenticates via OIDC env credentials, not a local profile
          profile: process.env.CI ? undefined : "milklab-dev",
        },
      },
    };
  },
  async run() {
    const trpcFn = new sst.aws.Function("TrpcFn", {
      handler: "apps/api/src/lambda.handler",
    });

    const api = new sst.aws.ApiGatewayV2("Api");
    // single greedy route: httpBatchLink needs the whole router on one route
    api.route("ANY /trpc/{proxy+}", trpcFn.arn);

    const web = new sst.aws.SvelteKit("Web", {
      path: "apps/web",
      link: [api],
      environment: {
        PUBLIC_TRPC_URL: $interpolate`${api.url}/trpc`,
      },
    });

    return { api: api.url, web: web.url };
  },
});
