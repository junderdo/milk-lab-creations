# Aurora DSQL compatibility for the animation data layer

Research date: 2026-08-02. Question: can Aurora DSQL hold the app's data layer
(user accounts, sharing records, 3D-animation payloads as JSON/binary capped
~100 KB each, stored in the database), for a low-traffic, cost-first, AWS-native
hobby app? Fallback: Aurora Serverless v2.

## Verdict: GO

Aurora DSQL fits this workload. Every hard requirement checks out against the
official docs:

- `jsonb` and `bytea` are both supported with a 1 MiB per-value limit — 10x
  headroom over the 100 KB payload cap.
- The free tier (100,000 DPUs + 1 GB storage per month) almost certainly covers
  this app entirely: a few hundred requests/day and a few thousand 100 KB rows
  should cost **$0/month**. Aurora Serverless v2 has no comparable free tier
  and bills ACU-hours even at min capacity.
- Lambda connectivity is first-class (IAM token auth, standard node-postgres
  via an official AWS connector), and SST v3 ships a native `sst.aws.Dsql`
  component with Lambda linking.

The trade-offs are schema-design constraints, not blockers: no foreign key
constraints (application-layer integrity instead), async-only index creation,
and DDL/transaction quirks that mostly matter to migration tooling. Drizzle has
no official DSQL support yet (works as generic Postgres with caveats); Prisma
has official AWS-built tooling as of Feb 2026. If any of the constraints below
becomes unacceptable (e.g. DB-enforced referential integrity is a must-have),
fall back to Aurora Serverless v2.

## Design constraints a schema designer must obey

1. **No foreign key constraints.** `REFERENCES` / `FOREIGN KEY` do not appear in
   the supported `CREATE TABLE` grammar; AWS's migration guide says to
   "implement validation in your application layer" for referential integrity.
   users ↔ animations ↔ shares integrity must be enforced in tRPC procedures
   (and orphan cleanup done in app code — no `ON DELETE CASCADE`).
2. **jsonb/bytea columns cannot be indexed or used in keys.** Both types show
   "Index support: No" — fine for opaque payload columns, but any queryable
   attribute (owner id, title, timestamps) must live in its own scalar column.
3. **Indexes are created with `CREATE [UNIQUE] INDEX ASYNC`**, which returns a
   job to poll rather than completing inline; plain `CREATE INDEX` is not the
   model. Migration tooling must accommodate this. Max 24 indexes/table, index
   key ≤ 1 KiB, ≤ 8 key columns.
4. **DDL and DML cannot share a transaction, and each transaction allows only
   1 DDL statement.** DML transactions may modify at most 3,000 rows and 10 MiB
   total, with a 5-minute transaction cap. (At ~100 KB/row, a bulk write tops
   out around ~100 rows/transaction on the size limit, not the row limit.)
5. **Prefer UUID primary keys.** AWS recommends UUIDs/application-generated IDs
   for data distribution; sequences and identity columns exist but their cached
   allocation makes values non-contiguous. Isolation is fixed at Repeatable
   Read with optimistic concurrency — writes need retry logic for OCC
   serialization errors.
6. **No triggers, no PL/pgSQL, no extensions, no temp tables, no TRUNCATE.**
   Views, SQL-language functions, `ON CONFLICT` upserts, and CTEs are
   supported. One database (`postgres`) per cluster, ≤ 10 schemas.

Sources for the above are cited per-question below.

## Findings

### 1. jsonb / bytea and size limits — SUPPORTED

The supported-data-types page lists, under "Miscellaneous data types":

- `json` — 1 MiB limit, "Variable up to 1 MiB limit", index support **No**
- `jsonb` — 1 MiB limit, "Variable up to 1 MiB limit", index support **No**
- `bytea` — 1 MiB limit, index support **No**
- `text` — 1 MiB limit, index support **Yes**; `varchar` limited to 65,535 bytes

Additionally: "Aurora DSQL automatically applies compression to large `json`
and `jsonb` values during `INSERT` and `UPDATE` operations. The 1 MiB limit
applies to the compressed size, so you can store `json` and `jsonb` values
significantly larger than 1 MiB as long as they compress below the limit."
DSQL "supports all PostgreSQL JSON functions and operators from section 9.16
... with identical behavior" (except `*_populate_record*` with custom composite
types, since `CREATE TYPE` is unsupported).

Row/column limits (quotas page): max row size 2 MiB; max size of a non-indexed
column 1 MiB; max 255 columns/table; primary-key and secondary-index key size
≤ 1 KiB each.

**Implication:** a ≤100 KB animation payload fits comfortably in a single
`jsonb` (or `bytea` for binary) column — no workaround type needed.

- https://docs.aws.amazon.com/aurora-dsql/latest/userguide/working-with-postgresql-compatibility-supported-data-types.html
- https://docs.aws.amazon.com/aurora-dsql/latest/userguide/CHAP_quotas.html

### 2. Foreign keys — NOT SUPPORTED

The supported `CREATE TABLE` syntax lists only `NOT NULL`, `NULL`, `CHECK`,
`DEFAULT`, `GENERATED ... AS IDENTITY`, `GENERATED ALWAYS AS ... STORED`,
`UNIQUE`, and `PRIMARY KEY` constraints — no `REFERENCES`/`FOREIGN KEY` clause.
The migration guide states: "Aurora DSQL supports table relationships and
`JOIN` operations. For referential integrity, implement validation in your
application layer. ... Implement referential integrity checks in your
application layer using consistent naming conventions, validation logic, and
transaction boundaries."

**Implication for users↔animations↔shares:** JOINs work fine; the DB will not
reject an orphaned `share` row or cascade deletes. Enforce ownership checks and
cleanup inside tRPC mutations, wrapping multi-table writes in a single
transaction (well under the 3,000-row / 10 MiB limits for this app).

- https://docs.aws.amazon.com/aurora-dsql/latest/userguide/create-table-syntax-support.html
- https://docs.aws.amazon.com/aurora-dsql/latest/userguide/working-with-postgresql-compatibility-migration-guide.html

### 3. Secondary indexes, unique constraints, DDL/transaction quirks

- DDL supports `CREATE [UNIQUE] INDEX ASYNC` (with `ON`, `NULLS FIRST/LAST`)
  and `DROP INDEX`; the migration guide says "Use `CREATE INDEX ASYNC` instead
  of `CREATE INDEX` for non-blocking index creation."
- `UNIQUE [NULLS [NOT] DISTINCT]` column and table constraints are supported in
  `CREATE TABLE`.
- Transaction constraints (migration guide, "considerations" section): "DDL and
  DML operations require separate transactions"; "A transaction can include
  only 1 DDL statement"; "A transaction can modify up to 3,000 rows, regardless
  of the number of secondary indexes"; isolation fixed at Repeatable Read.
- Quotas: 10 MiB max data modified per write transaction; 5-minute max
  transaction time; 24 indexes/table; 1 KiB max index key; 8 key columns max;
  1,000 tables; 10 schemas; 1 database per cluster.
- `TRUNCATE` is not available — use `DELETE FROM` or drop/recreate.
- OCC: conflicts surface as serialization errors at commit; AWS says to
  "implement idempotent transaction logic with retry mechanisms."

- https://docs.aws.amazon.com/aurora-dsql/latest/userguide/working-with-postgresql-compatibility-supported-sql-features.html
- https://docs.aws.amazon.com/aurora-dsql/latest/userguide/working-with-postgresql-compatibility-migration-guide.html
- https://docs.aws.amazon.com/aurora-dsql/latest/userguide/CHAP_quotas.html

### 4. Other unsupported / supported features

- **Triggers:** not supported — "For trigger-like functionality, implement
  event-driven logic in your application layer."
- **PL/pgSQL:** not supported — "Aurora DSQL supports SQL-based functions but
  not procedural languages like PL/pgSQL." (`CREATE FUNCTION ... LANGUAGE SQL`
  is supported.)
- **Sequences / identity columns: SUPPORTED** (added post-GA). DDL includes
  `CREATE/ALTER/DROP SEQUENCE`, and `CREATE TABLE` supports
  `GENERATED { ALWAYS | BY DEFAULT } AS IDENTITY`. AWS cautions that "the cache
  value should be carefully considered" and still recommends UUIDs for optimal
  distribution. Max 5,000 sequences.
- **Views: SUPPORTED** (`CREATE/ALTER/DROP VIEW`; max 5,000 views).
- **Extensions:** no extension support appears anywhere in the SQL feature
  docs, and `CREATE TYPE` is explicitly called out as unsupported.
- **Temporary tables:** not supported — "No temporary tables ... use common
  table expressions (CTEs) and subqueries."
- Environment: single `postgres` database, UTF-8, `C` collation only, UTC
  system timezone, connections time out after 1 hour.

- https://docs.aws.amazon.com/aurora-dsql/latest/userguide/working-with-postgresql-compatibility-migration-guide.html
- https://docs.aws.amazon.com/aurora-dsql/latest/userguide/working-with-postgresql-compatibility-supported-sql-features.html
- https://docs.aws.amazon.com/aurora-dsql/latest/userguide/create-table-syntax-support.html
- https://docs.aws.amazon.com/aurora-dsql/latest/userguide/sequences-identity-columns.html

### 5. Connection and auth from Lambda

- **Auth is IAM-token-based:** you generate a presigned token used as the
  Postgres password (`admin` role → `generate-db-connect-admin-auth-token` /
  IAM action `dsql:DbConnectAdmin`; custom roles → `...auth-token` /
  `dsql:DbConnect`). Default expiry 15 minutes, max 1 week; "After the
  connection is established, the connection remains valid even if the
  authentication token expires." Token generation is a local signing operation.
- **JS token generation:** `DsqlSigner` from **`@aws-sdk/dsql-signer`**
  (`getDbConnectAdminAuthToken` / `getDbConnectAuthToken`).
- **TLS required:** AWS's own connection examples use `PGSSLMODE=require`.
- **node-postgres works:** DSQL "uses the standard PostgreSQL wire protocol";
  AWS publishes node-postgres and Postgres.js samples plus a Lambda +
  node-postgres sample, and provides official Node.js connectors —
  "authentication plugins that extend ... node-postgres and Postgres.js ...
  to authenticate with Aurora DSQL using IAM credentials" (e.g.
  `@aws/aurora-dsql-node-postgres-connector`, as used in SST's docs).
- **Limits relevant to Lambda:** 10,000 connections/cluster, 100 new
  connections/second (1,000 burst), 60-minute max connection duration — no
  RDS-Proxy-style pooling concerns at this app's scale.

- https://docs.aws.amazon.com/aurora-dsql/latest/userguide/SECTION_authentication-token.html
- https://docs.aws.amazon.com/aurora-dsql/latest/userguide/SECTION_Node-js-connectors.html
- https://docs.aws.amazon.com/aurora-dsql/latest/userguide/aws-sdks.html
- https://docs.aws.amazon.com/aurora-dsql/latest/userguide/CHAP_quotas.html

### 6. TypeScript ORM support

- **Prisma — officially supported (Feb 2026).** AWS announced Prisma support on
  2026-02-25; the awslabs `aurora-dsql-orms` repo ships
  `@aws/aurora-dsql-prisma-tools` ("CLI tools for using Prisma with Aurora
  DSQL" — schema validation + DSQL-compatible migration generation), and Prisma
  connects via `@prisma/adapter-pg` + `@aws/aurora-dsql-node-postgres-connector`.
  AWS also maintains a Prisma sample in aws-samples/aurora-dsql-samples.
- **Drizzle — no official DSQL support yet.** No Drizzle adapter exists in
  AWS's adapters list, and drizzle-team/drizzle-orm issue #5248 ("[FEATURE]:
  AWS DSQL Support", opened 2026-01-11) is still open with no linked PRs;
  proper support is slated for after Drizzle v1. Drizzle's postgres driver does
  work against DSQL as a generic Postgres DB, but you must avoid `references()`
  in schemas and drive migrations yourself (drizzle-kit's generated DDL uses
  plain `CREATE INDEX` and multi-statement DDL transactions, which conflict
  with DSQL's async-index and 1-DDL-per-transaction rules).
- **Kysely** — no official adapter; as a query builder over `pg` it works
  wherever node-postgres works.
- **Raw `pg` (node-postgres)** — works today with the official connector or
  `@aws-sdk/dsql-signer` for the password.
- AWS's general statement: "Aurora DSQL uses the standard PostgreSQL wire
  protocol ... Most popular ORMs work with Aurora DSQL with minimal or no
  changes." Other official TS samples: Sequelize, TypeORM.

**Recommendation:** Prisma (official tooling) or Kysely/raw pg. If Drizzle is
strongly preferred, expect hand-managed migrations until issue #5248 lands.

- https://aws.amazon.com/about-aws/whats-new/2026/02/aurora-dsql-launches-tortoise-flyway-prisma
- https://github.com/awslabs/aurora-dsql-orms
- https://github.com/drizzle-team/drizzle-orm/issues/5248
- https://docs.aws.amazon.com/aurora-dsql/latest/userguide/aws-sdks.html

### 7. SST v3 provisioning

SST v3 has a first-class **`sst.aws.Dsql`** component — no Pulumi escape hatch
needed:

```ts
const cluster = new sst.aws.Dsql("MyCluster");

new sst.aws.Function("MyFunction", {
  handler: "src/lambda.handler",
  link: [cluster],
});
```

The component exposes `endpoint` and `region` outputs (plus multi-region
`peer` config and VPC-endpoint options); linking injects the cluster into the
function's `Resource` object and grants connect permissions. SST's example
connects with the official connector:

```ts
import { Resource } from "sst";
import { AuroraDSQLClient } from "@aws/aurora-dsql-node-postgres-connector";

const client = new AuroraDSQLClient({
  host: Resource.MyCluster.endpoint,
  user: "admin",
});
```

- https://sst.dev/docs/component/aws/dsql/

### 8. Pricing / free tier

From the official pricing page (aws.amazon.com/rds/aurora/dsql/pricing):

- **Free tier (monthly, ongoing):** 100,000 DPUs + 1 GB storage.
- **Beyond free tier:** ~$8 per 1M DPUs (rate used in AWS's US-East examples;
  check the page for us-west-2's exact figure) and $0.33 per GB-month storage.
- **What a DPU covers:** it "measures how much work the system does to run your
  SQL workload. This includes compute resources used to execute query logic
  (e.g., joins, functions, aggregations), the input/output (I/O) required to
  read from and write to storage, and change data capture (CDC) streaming when
  enabled." There is no per-cluster idle charge — an idle cluster consumes ~0
  DPUs, unlike Aurora Serverless v2's minimum-ACU billing.

**Hobby-app sanity estimate:** a few hundred requests/day ≈ ~10k–20k
simple-query operations/month — comfortably inside 100k free DPUs even if each
request costs several DPUs. A few thousand 100 KB rows ≈ 0.2–0.5 GB, inside
the 1 GB free storage. Expected bill: **$0/month**, with pennies of overage
even at 10x growth. This is the decisive cost advantage over Aurora
Serverless v2 for this app.

- https://aws.amazon.com/rds/aurora/dsql/pricing/
