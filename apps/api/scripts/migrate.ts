// Applies committed migrations to the linked DSQL cluster.
// Runs under `sst shell` (CI) or an sst dev DevCommand — both inject the
// linked Db resource. New migrations are generated with
// `aurora-dsql-prisma migrate`, never by hand-running `prisma migrate dev`
// (DSQL has no advisory locks or shadow databases).
import { spawnSync } from "node:child_process";
import { DsqlSigner } from "@aws-sdk/dsql-signer";
import { Resource } from "sst";

const hostname = Resource.Db.endpoint;
const region = Resource.Db.region;

const signer = new DsqlSigner({ hostname, region });
const token = await signer.getDbConnectAdminAuthToken();

const url = `postgresql://admin:${encodeURIComponent(token)}@${hostname}:5432/postgres?sslmode=require`;

const result = spawnSync("npx", ["prisma", "migrate", "deploy"], {
  stdio: "inherit",
  env: {
    ...process.env,
    DATABASE_URL: url,
    PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK: "1",
  },
});

process.exit(result.status ?? 1);
