// Prisma over DSQL: Rust-free client + pg adapter over the AWS connector,
// which mints an IAM token per new connection. Module scope so the pool
// survives across warm Lambda invocations.
import { AuroraDSQLPool } from "@aws/aurora-dsql-node-postgres-connector";
import { PrismaPg } from "@prisma/adapter-pg";
import { Resource } from "sst";
import { PrismaClient } from "./generated/prisma/client.ts";

export type Db = PrismaClient;

let db: PrismaClient | undefined;
let pool: AuroraDSQLPool | undefined;

export function getDb(): Db {
  if (!db) {
    pool = new AuroraDSQLPool({
      host: Resource.Db.endpoint,
      region: Resource.Db.region,
      user: "admin",
      database: "postgres",
      ssl: true,
      // Lambda-friendly: don't hold idle connections across a quiet spell
      max: 1,
      idleTimeoutMillis: 30_000,
    });
    db = new PrismaClient({ adapter: new PrismaPg(pool) });
  }
  return db;
}

/** OCC-retrying transaction helper for multi-row writes. */
export function getPool(): AuroraDSQLPool {
  if (!pool) getDb();
  return pool!;
}
