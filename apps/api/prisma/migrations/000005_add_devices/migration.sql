-- Registered pairs of ears, keyed (owner_id, serial) with no surrogate id — the
-- reasoning is in docs/adr/0002-how-a-pair-of-ears-is-identified.md. "My
-- devices" is a prefix scan of the primary key, so there is no secondary index
-- and none should be added. No CHECK on the serial: DSQL adds them NOT VALID,
-- so the zod schema at the tRPC boundary was always the real gate.
-- One DDL statement per explicit transaction block, per the DSQL dialect.

BEGIN;
CREATE TABLE "devices" (
    "owner_id" UUID NOT NULL,
    "serial" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "devices_pkey" PRIMARY KEY ("owner_id","serial")
);
COMMIT;
