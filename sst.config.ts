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
      // The Lambda owns CORS on every stage (apps/api/src/cors.ts). Gateway
      // CORS cannot work here: the greedy ANY route below matches OPTIONS, and
      // a matching route beats API Gateway's automatic preflight handling, so
      // preflights fell through to tRPC and came back 415.
      cors: false,
      // ...but `cors: false` only sets an EMPTY cors configuration (sst's
      // normalizeCors returns {}), and API Gateway strips the Origin header
      // before the integration whenever ANY cors configuration is present — so
      // the Lambda saw no Origin and could grant nothing. Force it absent.
      transform: {
        api: (apiArgs) => {
          apiArgs.corsConfiguration = undefined;
        },
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
        // Cloudflare Web Analytics. Public by nature — it ships in the page —
        // and prod-only, so personal stages stay out of the numbers.
        CF_BEACON_TOKEN: isProd ? "57ac47dbadc8470686378ac888fb7821" : "",
        ...authEnvironment,
      },
      assets: {
        fileOptions: [
          {
            // Rigged robot models: ~1 MB each, fetched lazily by the 3D viewer,
            // and they only change when the CAD is rebuilt. Their paths are
            // stable (`/models/<robot>.glb`), so a rebuilt model needs a
            // CloudFront invalidation to reach clients that already cached it —
            // accepted, since rig changes are rare and deliberate.
            files: "**/*.glb",
            contentType: "model/gltf-binary",
            cacheControl: "public,max-age=31536000,immutable",
          },
        ],
      },
    });

    // ordering matters: Api → Web → Function → route. The function needs web's
    // url to know the origin its CORS wrapper grants, and it stays acyclic
    // because api.url is known before its routes.
    const trpcFn = new sst.aws.Function("TrpcFn", {
      handler: "apps/api/src/lambda.handler",
      link: [db, userPool, userPoolClient],
      environment: {
        // production's origin is the static custom domain; a dev stage also
        // serves the vite dev server, and its own origin only exists post-deploy
        ALLOWED_WEB_ORIGINS: isProd ? prodWebOrigin : $interpolate`${webOrigin},${web.url}`,
      },
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
