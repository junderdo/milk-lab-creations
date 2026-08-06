-- Remix provenance. Nullable and unindexed by design: there is no FK
-- (relationMode = "prisma"), the column is allowed to dangle when the source
-- animation is deleted, and nothing queries by it — remix counts and
-- browse-remixes-of-this-animation are explicitly out of scope.
-- One DDL statement per explicit transaction block, per the DSQL dialect.

BEGIN;
ALTER TABLE "animations" ADD COLUMN "remixed_from_id" UUID;
COMMIT;
