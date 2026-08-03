# Backup/restore posture for the production Aurora DSQL cluster

Research date: 2026-08-02. Question: what backup/restore posture should the
production Aurora DSQL cluster have, for a cost-first hobby app (a few thousand
rows at ~100 KB each, total well under 1 GB, low traffic)? Cluster-per-stage
topology is decided; only production holds data worth protecting. SST v3
manages infra.

## RECOMMENDATION

**Enable deletion protection + a minimal AWS Backup plan: daily backup, 7-day
retention, warm storage, single region. Skip cold storage, cross-region copies,
and DIY pg_dump. Expected cost: well under $1/month — likely $0.30–$0.70/month
at this data size.**

Why: Aurora DSQL has **no PITR and no automatic/native backups** — if the
cluster is deleted or a bad `DELETE`/migration corrupts data, it is simply gone
unless AWS Backup recovery points exist. AWS Backup is the *only* supported
backup mechanism for DSQL, and at <1 GB it costs pennies. Deletion protection
alone does not protect against logical corruption. DIY pg_dump-to-S3 is
strictly worse here: it needs IAM token auth plumbing, a scheduler, an S3
bucket, and a batched restore script (DSQL caps DML at 3,000 rows per
transaction), all to save a few dimes.

### Concrete steps (all expressible in `sst.config.ts`)

The `aws` Pulumi namespace is globally available in `run()`, so these sit
alongside the existing SST components, production stage only:

1. `deletionProtectionEnabled: true` on the `aws.dsql.Cluster` (it defaults to
   `false`).
2. `aws.backup.Vault` — default AWS-managed KMS key is fine.
3. `aws.backup.Plan` with one rule: `schedule: "cron(0 9 * * ? *)"` (daily),
   `lifecycle: { deleteAfter: 7 }`, **no** cold-storage transition (cold has a
   90-day minimum with an early-delete fee — pointless at 7-day retention).
4. `aws.iam.Role` assumable by `backup.amazonaws.com` with the AWS-managed
   `AWSBackupServiceRolePolicyForBackup` and
   `AWSBackupServiceRolePolicyForRestores` policies attached.
5. `aws.backup.Selection` tying the plan to `resources: [cluster.arn]` with
   that role.
6. Accept that a restore produces a **new cluster with a new endpoint/ARN** —
   recovery is "run the restore job, then repoint SST at the new cluster ID and
   redeploy." Fine for a hobby app.

Cost math (us-west-2, AWS Pricing API): DSQL backups are **full** snapshots
(not incremental), so cost ≈ retained copies × data size × $0.10/GB-month warm.
7 daily recovery points × ~0.3–0.5 GB ≈ **$0.21–$0.35/month**; even at a full
1 GB per snapshot it's $0.70/month. A restore costs $0.02/GB (~$0.01 total).
If even that feels like too much, weekly backups with 28–35-day retention
(~4–5 copies) cost about the same or less — but daily/7 buys a 24 h RPO for the
same pocket change.

Sources for the above are cited per-question below.

## Findings

### 1. What DSQL offers natively — AWS Backup only, no PITR

- **AWS Backup is the only backup mechanism.** DSQL integrates with AWS Backup
  for on-demand and scheduled backups, retention policies, cross-Region and
  cross-account copies, and Vault Lock (WORM). You cannot back up from the DSQL
  console — only via the AWS Backup console/CLI/SDK. Backups are **full cluster
  snapshots only** (whole-cluster granularity — no per-table/per-database
  backup, and full rather than incremental).
- **No PITR / continuous backup.** In AWS Backup's feature-availability
  matrix, the Aurora DSQL row has *no* checkmark for "Continuous backup and
  point-in-time restore" and none for "Incremental backup". It does have:
  cross-Region copy ✓, cross-account copy ✓, full management ✓, lifecycle to
  cold storage ✓, logically air-gapped vault ✓.
- **Region support:** DSQL is a supported AWS Backup service in us-west-2
  (Oregon) per the "Supported services by AWS Region" table.
- **Cross-region / multi-region:** backup-plan rules can copy recovery points
  cross-Region; multi-Region cluster restore requires an identical copy of the
  recovery point in the peer Region and works within a "continent group"
  (Americas includes us-west-2). AWS Backup does **not** auto-replicate
  backups across Regions. (Not needed at hobby scale — a single-region posture
  is the recommendation.)

- https://docs.aws.amazon.com/aurora-dsql/latest/userguide/backup-aurora-dsql.html
- https://docs.aws.amazon.com/aws-backup/latest/devguide/restore-auroradsql.html
- https://docs.aws.amazon.com/aws-backup/latest/devguide/backup-feature-availability.html
- https://aws.amazon.com/about-aws/whats-new/2025/05/aws-backup-amazon-aurora-dsql/
- https://aws.amazon.com/about-aws/whats-new/2025/07/aws-backup-aurora-dsql-multi-region-restore-workflow
- https://aws.amazon.com/blogs/storage/protect-amazon-aurora-dsql-clusters-using-aws-backup

### 2. Pricing at hobby scale (us-west-2)

From the AWS Pricing bulk API offer file for AWSBackup, us-west-2
(`https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AWSBackup/current/us-west-2/index.json`
— the machine-readable source behind the pricing page, whose HTML tables are
JS-rendered):

| SKU (us-west-2, DSQL) | Price |
|---|---|
| Warm backup storage | **$0.10 / GB-month** |
| Cold backup storage | $0.03 / GB-month (+ $0.03/GB-mo early-delete charge) |
| Restore from warm | **$0.02 / GB** |
| Restore from cold | $0.03 / GB |
| Cross-Region copy transfer (usw2 → most Regions) | $0.02 / GB |
| Air-gapped vault warm / cold | $0.115 / $0.0345 per GB-month |

Note: third-party blogs quoting "$0.05/GB warm" are citing generic Aurora
rates, not DSQL — the DSQL warm rate in us-west-2 is $0.10.

- **DSQL free tier (verified):** first **100,000 DPUs and 1 GB of storage free
  each month**; beyond that, $8/million DPUs and $0.33/GB-month storage. The
  free tier covers DSQL usage/storage only — AWS Backup charges are separate
  and have **no free tier** ("pay only for backup storage used, cross-Region
  transfer, and data restored"; no minimums).
- **Monthly estimate:** each recovery point is a full copy, so cost = retained
  copies × data size × $0.10. Daily backups with 7-day retention at ≤0.5 GB ≈
  **$0.21–$0.35/mo**; worst case at 1 GB/snapshot ≈ $0.70/mo.

- https://aws.amazon.com/rds/aurora/dsql/pricing/
- https://aws.amazon.com/backup/pricing/

### 3. Restore workflow, RTO, gotchas

- **Restores always create a NEW cluster** — never in-place, never overwriting
  the source. Via the AWS Backup console or `aws backup start-restore-job`
  with metadata (`regionalConfig` with `isDeletionProtectionEnabled`,
  `kmsKeyId`).
- **Consequences:** new cluster ID → new endpoint and new ARN. The app must be
  repointed (in SST terms: update the cluster reference and redeploy), and any
  IAM policies scoped to the old cluster ARN (`dsql:DbConnect*` etc.) must be
  updated. Tags copy only with `--copy-source-tags-to-restored-resource`.
  Deletion protection defaults to **enabled** on the restored cluster;
  AWS-managed KMS key by default.
- **RTO:** AWS publishes **no restore-duration figures** for DSQL (docs, blog,
  what's-new all checked — unconfirmed from primary sources). Monitor via
  `aws backup describe-restore-job`. Plan for "restore job + config update +
  redeploy" — realistically an hour-ish of wall clock, but that duration is
  inference, not an AWS claim.
- **Gotchas:** multi-Region restore requires identical recovery-point copies
  in peer Regions within one continent group; cross-account copy can fail if
  the destination account lacks the DSQL service-linked role
  (`AuroraDsqlServiceLinkedRolePolicy`). Restore testing and Backup Audit
  Manager are not available for DSQL.

- https://docs.aws.amazon.com/aws-backup/latest/devguide/restore-auroradsql.html

### 4. What a cost-first hobby app should enable beyond deletion protection

Covered in the RECOMMENDATION: a minimal daily/7-day AWS Backup plan. The
alternatives, and why not:

- **Nothing:** not acceptable even for a hobby app, because DSQL uniquely has
  no automatic backups or PITR fallback — deletion protection does not protect
  against logical corruption or a bad migration.
- **DIY pg_dump-to-S3 cron:** AWS does not document pg_dump support for DSQL
  either way (no primary source confirms or denies it). DSQL speaks the
  standard Postgres wire protocol so dumping *should* work for plain data,
  but: connections time out after 1 hour (fine at this size); the **restore
  side is the real problem** — a transaction can modify at most 3,000 rows and
  DDL/DML must be in separate transactions (one DDL per transaction), so
  replaying a dump requires batching (a naive `psql < dump.sql` with large
  `COPY` blocks can exceed limits); no PL/pgSQL, no SERIAL, single `postgres`
  database per cluster. Plus IAM-token auth (short-lived tokens) inside a
  scheduled Lambda, an S3 bucket, lifecycle rules — all to avoid ~$0.30/month.
  Reasonable only as an *optional* secondary human-readable export for data
  portability off DSQL, not as the primary mechanism.

- https://docs.aws.amazon.com/aurora-dsql/latest/userguide/working-with-postgresql-compatibility-unsupported-features.html
- https://docs.aws.amazon.com/aurora-dsql/latest/userguide/backup-aurora-dsql.html

### 5. IaC expressibility in SST v3 — fully expressible

- **`aws.dsql.Cluster`** exists in the Pulumi AWS provider with
  `deletionProtectionEnabled` (default `false`), `kmsEncryptionKey`,
  `multiRegionProperties`, `tags`; outputs `arn` and `identifier`.
- **`aws.backup.Plan`, `aws.backup.Vault`, `aws.backup.Selection`** all exist;
  `Selection.resources` accepts arbitrary ARNs, so passing the DSQL cluster's
  `arn` output works (AWS Backup natively supports the DSQL resource type per
  finding 1). Also declare an `aws.iam.Role` for AWS Backup with the
  AWS-managed backup/restore policies.
- **SST v3:** the `aws` Pulumi namespace is preloaded and globally available
  in `sst.config.ts`'s `run()` — raw Pulumi AWS resources can be instantiated
  alongside SST components with no imports.
- **Manual steps remaining:** none for the backup plan itself. The *restore*
  is inherently operational (AWS Backup console or CLI), and after a restore
  the cluster reference in SST must be updated since the restored cluster has
  a new ID/ARN.

- https://www.pulumi.com/registry/packages/aws/api-docs/dsql/cluster/
- https://www.pulumi.com/registry/packages/aws/api-docs/backup/selection/
- https://sst.dev/docs/providers/
- https://sst.dev/docs/all-providers/
