// Prisma 7 routes connection details exclusively through this config
// file (the schema's `url = env(...)` form was dropped). At build time
// on Netlify, this file is read by `prisma migrate deploy`, so the env
// var must be populated before this module evaluates.
import "dotenv/config";
import { defineConfig } from "prisma/config";

// Resolve the connection URL once, with a loud error if it isn't set.
// Prisma 7's native error for an undefined url reads "The datasource.url
// property is required in your Prisma config file when using prisma
// migrate deploy" — which sends people debugging the config file when
// the real fix is to set DATABASE_URL in the build environment. This
// wrapper makes the actual cause obvious in the Netlify build log.
const databaseUrl = process.env["DATABASE_URL"];
if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is not set in the build environment. " +
      "Add it under Netlify → Site settings → Environment variables " +
      "(scope: All deploy contexts, including Builds). " +
      "Same value used by Prisma Client at runtime — typically the " +
      "pooled Postgres connection string ending in ?sslmode=require.",
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
