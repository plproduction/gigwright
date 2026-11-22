import { db } from "@/lib/db";

// Setting a musician's roles from the roster form means editing call-list
// membership, because that's the only place roles live now. Kept out of
// the "use server" action files so it can be a plain function rather than
// an exported server action.
//
// Adding someone to a role puts them at the END of its call list — a new
// hire is not your first call. Removing them takes them off that list
// entirely; everyone else's order is left alone (gaps in callOrder are
// fine, it's an ordering, not an index).
export async function syncMusicianRoles(
  ownerId: string,
  musicianId: string,
  roleIds: string[],
  newRoleNames: string[],
): Promise<void> {
  // Only roles this bandleader owns. A posted id for someone else's role
  // is dropped rather than trusted.
  const owned = await db.role.findMany({
    where: { id: { in: roleIds }, ownerId },
    select: { id: true },
  });
  const wanted = new Set(owned.map((r) => r.id));

  // Roles typed into the "add a new role" box. Matched case-insensitively
  // against what already exists so typing "sax" when you have "Sax"
  // joins that one instead of making a near-duplicate.
  for (const raw of newRoleNames) {
    const name = raw.trim();
    if (!name) continue;
    const existing = await db.role.findFirst({
      where: { ownerId, name: { equals: name, mode: "insensitive" } },
      select: { id: true },
    });
    if (existing) {
      wanted.add(existing.id);
      continue;
    }
    const last = await db.role.findFirst({
      where: { ownerId },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    const created = await db.role.create({
      data: { ownerId, name, position: (last?.position ?? -1) + 1 },
      select: { id: true },
    });
    wanted.add(created.id);
  }

  const current = await db.roleMember.findMany({
    where: { musicianId, role: { ownerId } },
    select: { id: true, roleId: true },
  });
  const have = new Set(current.map((c) => c.roleId));

  const toRemove = current.filter((c) => !wanted.has(c.roleId)).map((c) => c.id);
  if (toRemove.length > 0) {
    await db.roleMember.deleteMany({ where: { id: { in: toRemove } } });
  }

  for (const roleId of wanted) {
    if (have.has(roleId)) continue;
    const last = await db.roleMember.findFirst({
      where: { roleId },
      orderBy: { callOrder: "desc" },
      select: { callOrder: true },
    });
    await db.roleMember.upsert({
      where: { roleId_musicianId: { roleId, musicianId } },
      update: {},
      create: { roleId, musicianId, callOrder: (last?.callOrder ?? -1) + 1 },
    });
  }
}
