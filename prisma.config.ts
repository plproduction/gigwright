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

// Resolve the connection URL. If it's missing, behavior depends on
// where we are:
//
//   • Netlify (or local / CI): throw a loud error so the operator knows
//     to set DATABASE_URL. Prisma 7's native error reads "The
//     datasource.url property is required..." which sends people
//     debugging the config file instead of the env.
//
//   • Vercel preview builds: silently fall back to a placeholder. Vercel
//     is connected via the GitHub App but isn't an active deploy target
//     for GigWright (production = Netlify). Vercel's build runs `npm
//     install` which triggers `prisma generate` via postinstall —
//     that step does NOT use the datasource URL, so a placeholder is
//     fine. Vercel's build never runs `migrate deploy`, so the
//     placeholder is never queried as a real connection.
let databaseUrl: string | undefined = process.env["DATABASE_URL"];
if (!databaseUrl) {
  if (process.env["VERCEL"]) {
    console.warn(
      "[prisma.config] Vercel build detected without DATABASE_URL. " +
        "Using a placeholder URL so `prisma generate` can complete. " +
        "GigWright doesn't actually deploy on Vercel — to silence " +
        "these failed-build emails permanently, disconnect the Vercel " +
        "GitHub App from this repo in the Vercel dashboard.",
    );
    databaseUrl =
      "postgresql://placeholder:placeholder@localhost:5432/none?schema=public";
  } else {
    throw new Error(
      "DATABASE_URL is not set in the build environment. " +
        "Production builds on Netlify — add it under Site settings → " +
        "Environment variables (scope: All deploy contexts, including " +
        "Builds). Same value used by Prisma Client at runtime — " +
        "typically the pooled Postgres connection string ending in " +
        "?sslmode=require.",
    );
  }
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
