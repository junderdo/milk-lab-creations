// Applies committed migrations to the linked DSQL cluster.
// Runs under `sst shell` (CI) or an sst dev DevCommand — both inject the
// linked Db resource. New migrations are generated with
// `pnpm db:migrate:new prisma/migrations/<n>_<name>/migration.sql` (pass
// --from-url for an incremental diff), never by hand-running
// `prisma migrate dev` (DSQL has no advisory locks or shadow databases).
import { spawnSync } from "node:child_process";
import { DsqlSigner } from "@aws-sdk/dsql-signer";
import { Resource } from "sst";

const hostname = Resource.Db.endpoint;
const region = Resource.Db.region;

const signer = new DsqlSigner({ hostname, region });
const token = await signer.getDbConnectAdminAuthToken();

const url = `postgresql://admin:${encodeURIComponent(token)}@${hostname}:5432/postgres?sslmode=require`;

// default is `migrate deploy`; pass alternate prisma args for recovery,
// e.g. `db:migrate migrate resolve --rolled-back <name>`
const prismaArgs =
  process.argv.length > 2 ? process.argv.slice(2) : ["migrate", "deploy"];

const result = spawnSync("npx", ["prisma", ...prismaArgs], {
  stdio: "inherit",
  env: {
    ...process.env,
    DATABASE_URL: url,
    PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK: "1",
  },
});

process.exit(result.status ?? 1);
