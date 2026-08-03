-- Seed the robot catalog (DML must not share a transaction with DDL,
-- so seeding lives in its own migration). New robots arrive by migration —
-- there is no runtime add-robot API.

-- DSQL enforces unique constraints asynchronously (deferrable), which
-- Postgres rejects as ON CONFLICT arbiters — guard with NOT EXISTS instead.
INSERT INTO "robots" ("slug", "name")
SELECT 'robo-cat-ears', 'Robo Cat Ears'
WHERE NOT EXISTS (SELECT 1 FROM "robots" WHERE "slug" = 'robo-cat-ears');
