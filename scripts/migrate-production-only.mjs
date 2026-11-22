// Run `prisma migrate deploy` ONLY on a real production deploy.
//
// Why this exists: `migrate deploy` used to sit directly in the build
// command, and DATABASE_URL is scoped to every deploy context. So opening
// a pull request was enough to apply that branch's migrations to the live
// database — before anyone reviewed them, and whether or not the PR ever
// merged. An additive migration survives that fine. A migration that
// drops or renames a column takes production down with it.
//
// Netlify sets CONTEXT to "production", "deploy-preview" or
// "branch-deploy". We migrate on the first and skip the rest, which keeps
// the convenient part (production deploys still migrate themselves, so a
// merged migration can't be forgotten) and removes the dangerous part.
//
// Skipping is safe for previews: they share the production database, so
// the schema they need is already there. A preview whose branch adds a
// migration will render against the pre-migration schema — if you need to
// exercise the new tables in a preview, apply it deliberately with
// `npm run db:deploy`, or point that preview at a Neon branch.
//
// Locally, CONTEXT is unset, so a plain `npm run build` no longer tries to
// reach a database that isn't there.

import { spawnSync } from "node:child_process";

const context = process.env.CONTEXT;

if (context !== "production") {
  console.log(
    `[migrate] Skipping \`prisma migrate deploy\` — context is ${
      context ? `"${context}"` : "unset (local build)"
    }, not "production". Run \`npm run db:deploy\` to apply migrations deliberately.`,
  );
  process.exit(0);
}

console.log('[migrate] Context is "production" — applying migrations.');

// --no-install is load-bearing: plain `npx prisma` will silently fetch a
// prisma from the registry when it can't resolve one locally, and that
// download is whatever's newest — currently an 8.x release candidate,
// which rejects `migrate deploy` outright since this project is on
// Prisma 7. Fail loudly on a missing local install instead of running a
// different major version against the production database.
const result = spawnSync("npx", ["--no-install", "prisma", "migrate", "deploy"], {
  stdio: "inherit",
  shell: false,
});

// Fail the build when the migration fails. Deploying code that expects a
// schema the database doesn't have is worse than not deploying at all.
if (result.error) {
  console.error("[migrate] Could not run prisma:", result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
