-- The chosen avatar, as a prefixed token (`preset:cat-01`). Nullable and
-- unindexed by design: DSQL has no `ALTER COLUMN ... SET NOT NULL`, so a column
-- added after CREATE TABLE is nullable for the life of the table, and NULL is
-- absorbed at the boundary (`avatarOf(null)` picks a preset from the user id)
-- rather than modelled as a "no avatar" state. No CHECK: the closed set is
-- enforced by zod at the tRPC boundary, as `visibility` already is.
-- One DDL statement per explicit transaction block, per the DSQL dialect.

BEGIN;
ALTER TABLE "users" ADD COLUMN "avatar" TEXT;
COMMIT;
