import { defineConfig } from "prisma/config";

// DATABASE_URL is only present when migrating (set by scripts/migrate.ts with
// a fresh DSQL IAM token); `prisma generate` never needs it.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
