-- DSQL-dialect migration: one DDL statement per transaction, async indexes
-- outside transaction blocks, no FK constraints (relationMode = "prisma").

BEGIN;
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);
COMMIT;

BEGIN;
CREATE TABLE "robots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "robots_pkey" PRIMARY KEY ("id")
);
COMMIT;

BEGIN;
CREATE TABLE "animations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "owner_id" UUID NOT NULL,
    "robot_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "visibility" TEXT NOT NULL DEFAULT 'private',
    "payload" JSONB NOT NULL,
    "duration_ms" INTEGER NOT NULL,
    "keyframe_count" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "animations_pkey" PRIMARY KEY ("id")
);
COMMIT;

CREATE UNIQUE INDEX ASYNC "robots_slug_key" ON "robots"("slug");

CREATE INDEX ASYNC "animations_owner_id_created_at_idx" ON "animations"("owner_id", "created_at");

CREATE INDEX ASYNC "animations_visibility_created_at_idx" ON "animations"("visibility", "created_at");
