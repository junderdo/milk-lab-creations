-- Seed the robot catalog (DML must not share a transaction with DDL,
-- so seeding lives in its own migration). New robots arrive by migration —
-- there is no runtime add-robot API.

INSERT INTO "robots" ("slug", "name")
VALUES ('robo-cat-ears', 'Robo Cat Ears')
ON CONFLICT DO NOTHING;
