// Prisma 7 routes connection details exclusively through this config
// file (the schema's `url = env(...)` form was dropped). At build time
// this file is read by `prisma migrate deploy`, so DATABASE_URL must
// be populated in the build environment before this module evaluates.
//
// Production deploys from Netlify. If you're seeing this file fail on
// a different host (Vercel preview, a local build without a .env, a
// fresh CI container), the fix is the same: set DATABASE_URL there or
// disconnect that integration if it isn't supposed to be building.
import "dotenv/config";
import { defineConfig } from "prisma/config";

// Resolve the connection URL once, with a loud error if it isn't set.
// Prisma 7's native error for an undefined url reads "The datasource.url
// property is required in your Prisma config file when using prisma
// migrate deploy" — which sends people debugging the config file when
// the real fix is to set DATABASE_URL in the build environment.
const databaseUrl = process.env["DATABASE_URL"];
if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is not set in the build environment. " +
      "Production builds on Netlify — add it under Site settings → " +
      "Environment variables (scope: All deploy contexts, including " +
      "Builds). If this error is firing on Vercel, that integration " +
      "isn't actively used by GigWright and can safely be ignored or " +
      "disconnected. Same value used by Prisma Client at runtime — " +
      "typically the pooled Postgres connection string ending in " +
      "?sslmode=require.",
  );
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: databaseUrl,
  },
});
