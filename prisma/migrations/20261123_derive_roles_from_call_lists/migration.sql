-- Musician.roles was a free-text String[] typed on the roster form.
-- Roles and call lists (Role / RoleMember) now say who plays what, so
-- the free-text column becomes a second, silently-diverging source of
-- truth. This migration folds it into the real thing and removes it.
--
-- Everything below is idempotent-ish by construction: roles that already
-- exist are matched rather than duplicated, and musicians already on a
-- call list are left where they are (ON CONFLICT DO NOTHING) instead of
-- being bumped to last.

-- 0. Keep the free-text values. The derivation below is a judgement
--    call (case-folding, matching against existing roles) and this is
--    the only copy of what was actually typed. Dropped in a later
--    migration once the derived data has been looked at.
CREATE TABLE IF NOT EXISTS "_MusicianRolesBackup" AS
SELECT
  "id" AS "musicianId",
  "ownerId",
  "roles",
  now() AS "backedUpAt"
FROM "Musician";

-- 1. Every distinct free-text role becomes a real Role. Matched
--    case-insensitively against roles the owner already created, so
--    typing "sax" when a "Sax" role exists joins that one.
WITH tagged AS (
  SELECT m."ownerId", btrim(t.role_raw) AS raw
  FROM "Musician" m, LATERAL unnest(m."roles") AS t(role_raw)
  WHERE btrim(t.role_raw) <> ''
),
folded AS (
  SELECT "ownerId", lower(raw) AS key, min(raw) AS name
  FROM tagged
  GROUP BY "ownerId", lower(raw)
),
missing AS (
  SELECT f."ownerId", f.name
  FROM folded f
  WHERE NOT EXISTS (
    SELECT 1 FROM "Role" x
    WHERE x."ownerId" = f."ownerId" AND lower(x."name") = f.key
  )
)
INSERT INTO "Role" ("id", "ownerId", "name", "position", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  d."ownerId",
  d.name,
  CAST(
    (SELECT COALESCE(MAX(x."position"), -1) FROM "Role" x WHERE x."ownerId" = d."ownerId")
      + row_number() OVER (PARTITION BY d."ownerId" ORDER BY d.name)
    AS INT
  ),
  now(),
  now()
FROM missing d;

-- 2. Put each musician on the call list for every role they were
--    tagged with, in name order, after anyone already on that list.
WITH tagged AS (
  SELECT
    m."id"      AS musician_id,
    m."name"    AS musician_name,
    m."ownerId",
    lower(btrim(t.role_raw)) AS key
  FROM "Musician" m, LATERAL unnest(m."roles") AS t(role_raw)
  WHERE btrim(t.role_raw) <> ''
),
pairs AS (
  SELECT DISTINCT rl."id" AS role_id, e.musician_id, e.musician_name
  FROM tagged e
  JOIN "Role" rl
    ON rl."ownerId" = e."ownerId"
   AND lower(rl."name") = e.key
)
INSERT INTO "RoleMember" ("id", "roleId", "musicianId", "callOrder")
SELECT
  gen_random_uuid()::text,
  p.role_id,
  p.musician_id,
  CAST(
    (SELECT COALESCE(MAX(rm."callOrder"), -1) FROM "RoleMember" rm WHERE rm."roleId" = p.role_id)
      + row_number() OVER (PARTITION BY p.role_id ORDER BY p.musician_name, p.musician_id)
    AS INT
  )
FROM pairs p
ON CONFLICT ("roleId", "musicianId") DO NOTHING;

-- 3. One place to say who plays what.
ALTER TABLE "Musician" DROP COLUMN "roles";
