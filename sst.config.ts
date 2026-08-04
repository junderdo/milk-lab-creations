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
    // custom domains only on production; dev stages keep their random AWS URLs
    const isProd = $app.stage === "production";

    const db = new sst.aws.Dsql("Db", {
      // decided posture: daily backup, 7-day retention, warm, single region
      // (component defaults) — production only; dev clusters are disposable
      backup: isProd,
      transform: {
        cluster: isProd ? { deletionProtectionEnabled: true } : undefined,
      },
    });

    // Google OAuth client is registered once in Google Cloud console; each
    // stage's Cognito domain must be added to its authorized redirect URIs
    const googleClientId = new sst.Secret("GoogleClientId");
    const googleClientSecret = new sst.Secret("GoogleClientSecret");

    const userPool = new sst.aws.CognitoUserPool("UserPool", {
      domain: { prefix: `milklab-${$app.stage}` },
    });

    const google = userPool.addIdentityProvider("Google", {
      type: "google",
      details: {
        authorize_scopes: "openid email profile",
        client_id: googleClientId.value,
        client_secret: googleClientSecret.value,
      },
      attributes: { email: "email", name: "name", username: "sub" },
    });

    const prodWebOrigin = "https://milklabcreations.com";
    const webOrigin = isProd ? prodWebOrigin : "http://localhost:5173";

    const userPoolClient = userPool.addClient("WebClient", {
      providers: [google.providerName],
      callbackUrls: [`${webOrigin}/auth/callback`],
      transform: {
        client: {
          allowedOauthFlows: ["code"],
          allowedOauthScopes: ["openid", "email", "profile"],
          logoutUrls: [webOrigin],
          // decided session posture: ~90-day refresh, ~1h access
          refreshTokenValidity: 90,
          accessTokenValidity: 1,
          idTokenValidity: 1,
          tokenValidityUnits: {
            refreshToken: "days",
            accessToken: "hours",
            idToken: "hours",
          },
        },
      },
    });

    const api = new sst.aws.ApiGatewayV2("Api", {
      domain: isProd ? "api.milklabcreations.com" : undefined,
      // production's only browser origin is known statically, so the gateway
      // answers preflights at the edge. A non-prod stage's own web origin only
      // exists after deploy, so those stages validate the Origin in the Lambda
      // instead (see apps/api/src/cors.ts) and the gateway stays out of it.
      cors: isProd && {
        allowOrigins: [prodWebOrigin],
        allowHeaders: ["authorization", "content-type"],
        allowMethods: ["GET", "POST", "OPTIONS"],
        allowCredentials: false,
        maxAge: "1 day",
      },
    });

    const apiUrl = isProd ? "https://api.milklabcreations.com" : api.url;

    const authEnvironment = {
      PUBLIC_COGNITO_DOMAIN: $interpolate`milklab-${$app.stage}.auth.us-west-2.amazoncognito.com`,
      PUBLIC_COGNITO_CLIENT_ID: userPoolClient.id,
    };

    const web = new sst.aws.SvelteKit("Web", {
      path: "apps/web",
      link: [api, userPool, userPoolClient],
      domain: isProd
        ? { name: "milklabcreations.com", redirects: ["www.milklabcreations.com"] }
        : undefined,
      environment: {
        // sst dev serves the API from the local dev-server, not the deployed gateway
        PUBLIC_TRPC_URL: $dev ? "http://localhost:3001/trpc" : $interpolate`${apiUrl}/trpc`,
        ...authEnvironment,
      },
    });

    // ordering matters: Api → Web → Function → route. Linking web into the
    // function (non-prod only) is what tells its CORS wrapper the stage's own
    // origin, and it stays acyclic because api.url is known before its routes.
    const trpcFn = new sst.aws.Function("TrpcFn", {
      handler: "apps/api/src/lambda.handler",
      link: isProd ? [db, userPool, userPoolClient] : [db, userPool, userPoolClient, web],
    });
    // single greedy route: httpBatchLink needs the whole router on one route
    api.route("ANY /trpc/{proxy+}", trpcFn.arn);

    if ($dev) {
      new sst.x.DevCommand("ApiServer", {
        link: [db, userPool, userPoolClient],
        dev: {
          command: "pnpm --filter @milklab/api dev:server",
          directory: ".",
        },
        environment: authEnvironment,
      });
      new sst.x.DevCommand("DbMigrate", {
        link: [db],
        dev: {
          command: "pnpm --filter @milklab/api db:migrate",
          directory: ".",
        },
      });
    }

    return { api: apiUrl, web: web.url };
  },
});
