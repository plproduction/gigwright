"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireBandleader } from "@/lib/session";
import { SUGGESTED_ROLES } from "@/lib/roles";

// Roles, call order and lineups all live on one page, so they share one
// actions file. Everything here is scoped by ownerId — a bandleader can
// only ever touch their own band's shape.

const PAGE = "/roster";

function text(v: FormDataEntryValue | null): string {
  return String(v ?? "").trim();
}

function nullIfEmpty(v: FormDataEntryValue | null): string | null {
  const s = text(v);
  return s === "" ? null : s;
}

function centsOrNull(v: FormDataEntryValue | null): number | null {
  const s = text(v).replace(/[^0-9.\-]/g, "");
  if (s === "") return null;
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

async function ownRole(ownerId: string, roleId: string) {
  const role = await db.role.findFirst({ where: { id: roleId, ownerId } });
  if (!role) throw new Error("Role not found");
  return role;
}

async function ownLineup(ownerId: string, lineupId: string) {
  const lineup = await db.lineup.findFirst({ where: { id: lineupId, ownerId } });
  if (!lineup) throw new Error("Lineup not found");
  return lineup;
}

// ── Roles ────────────────────────────────────────────────────────

export async function createRole(formData: FormData) {
  const user = await requireBandleader();
  const name = text(formData.get("name"));
  if (!name) return;

  const last = await db.role.findFirst({
    where: { ownerId: user.id },
    orderBy: { position: "desc" },
    select: { position: true },
  });

  // Name is unique per owner; a repeat submit (double-click, back
  // button) should be a no-op rather than an error page.
  const existing = await db.role.findFirst({ where: { ownerId: user.id, name } });
  if (existing) return;

  await db.role.create({
    data: {
      ownerId: user.id,
      name,
      defaultPayCents: centsOrNull(formData.get("defaultPay")),
      position: (last?.position ?? -1) + 1,
    },
  });
  revalidatePath(PAGE);
}

// Starting from an empty page is the worst part of a tool like this.
// One click lays down the usual chairs; they're ordinary roles after
// that — rename them, re-order them, delete the ones you don't book.
// No-op if any role already exists, so a double-click can't duplicate.
export async function seedSuggestedRoles() {
  const user = await requireBandleader();
  const existing = await db.role.count({ where: { ownerId: user.id } });
  if (existing > 0) return;

  await db.role.createMany({
    data: SUGGESTED_ROLES.map((name, i) => ({
      ownerId: user.id,
      name,
      position: i,
    })),
    skipDuplicates: true,
  });
  revalidatePath(PAGE);
}

export async function updateRole(roleId: string, formData: FormData) {
  const user = await requireBandleader();
  await ownRole(user.id, roleId);
  const name = text(formData.get("name"));
  await db.role.update({
    where: { id: roleId },
    data: {
      ...(name ? { name } : {}),
      defaultPayCents: centsOrNull(formData.get("defaultPay")),
    },
  });
  revalidatePath(PAGE);
}

export async function deleteRole(roleId: string) {
  const user = await requireBandleader();
  await ownRole(user.id, roleId);
  // GigPersonnel.roleId is SetNull, so deleting a role never deletes
  // anyone from a gig — those rows fall back to their roleLabel.
  await db.role.delete({ where: { id: roleId } });
  revalidatePath(PAGE);
}

export async function moveRole(roleId: string, direction: "up" | "down") {
  const user = await requireBandleader();
  const role = await ownRole(user.id, roleId);
  const neighbour = await db.role.findFirst({
    where: {
      ownerId: user.id,
      position: direction === "up" ? { lt: role.position } : { gt: role.position },
    },
    orderBy: { position: direction === "up" ? "desc" : "asc" },
  });
  if (!neighbour) return; // already at the end

  await db.$transaction([
    db.role.update({ where: { id: role.id }, data: { position: neighbour.position } }),
    db.role.update({ where: { id: neighbour.id }, data: { position: role.position } }),
  ]);
  revalidatePath(PAGE);
}

// ── Call order ───────────────────────────────────────────────────

export async function addToCallList(roleId: string, formData: FormData) {
  const user = await requireBandleader();
  await ownRole(user.id, roleId);
  const musicianId = text(formData.get("musicianId"));
  if (!musicianId) return;

  const musician = await db.musician.findFirst({
    where: { id: musicianId, ownerId: user.id },
    select: { id: true },
  });
  if (!musician) throw new Error("Musician not found");

  const last = await db.roleMember.findFirst({
    where: { roleId },
    orderBy: { callOrder: "desc" },
    select: { callOrder: true },
  });

  // Already on the list → leave their position alone rather than
  // bumping them to last, which is never what you meant.
  await db.roleMember.upsert({
    where: { roleId_musicianId: { roleId, musicianId } },
    update: {},
    create: { roleId, musicianId, callOrder: (last?.callOrder ?? -1) + 1 },
  });
  revalidatePath(PAGE);
}

export async function removeFromCallList(roleMemberId: string) {
  const user = await requireBandleader();
  const row = await db.roleMember.findFirst({
    where: { id: roleMemberId, role: { ownerId: user.id } },
  });
  if (!row) throw new Error("Not found");
  await db.roleMember.delete({ where: { id: roleMemberId } });
  revalidatePath(PAGE);
}

export async function moveInCallList(roleMemberId: string, direction: "up" | "down") {
  const user = await requireBandleader();
  const row = await db.roleMember.findFirst({
    where: { id: roleMemberId, role: { ownerId: user.id } },
  });
  if (!row) throw new Error("Not found");

  const neighbour = await db.roleMember.findFirst({
    where: {
      roleId: row.roleId,
      callOrder: direction === "up" ? { lt: row.callOrder } : { gt: row.callOrder },
    },
    orderBy: { callOrder: direction === "up" ? "desc" : "asc" },
  });
  if (!neighbour) return;

  await db.$transaction([
    db.roleMember.update({ where: { id: row.id }, data: { callOrder: neighbour.callOrder } }),
    db.roleMember.update({ where: { id: neighbour.id }, data: { callOrder: row.callOrder } }),
  ]);
  revalidatePath(PAGE);
}

// ── Lineups ──────────────────────────────────────────────────────

export async function createLineup(formData: FormData) {
  const user = await requireBandleader();
  const name = text(formData.get("name"));
  if (!name) return;

  const existing = await db.lineup.findFirst({ where: { ownerId: user.id, name } });
  if (existing) return;

  const last = await db.lineup.findFirst({
    where: { ownerId: user.id },
    orderBy: { position: "desc" },
    select: { position: true },
  });

  await db.lineup.create({
    data: {
      ownerId: user.id,
      name,
      sizeLabel: nullIfEmpty(formData.get("sizeLabel")),
      clientPriceCents: centsOrNull(formData.get("clientPrice")),
      description: nullIfEmpty(formData.get("description")),
      position: (last?.position ?? -1) + 1,
    },
  });
  revalidatePath(PAGE);
}

export async function updateLineup(lineupId: string, formData: FormData) {
  const user = await requireBandleader();
  await ownLineup(user.id, lineupId);
  const name = text(formData.get("name"));
  await db.lineup.update({
    where: { id: lineupId },
    data: {
      ...(name ? { name } : {}),
      sizeLabel: nullIfEmpty(formData.get("sizeLabel")),
      clientPriceCents: centsOrNull(formData.get("clientPrice")),
      description: nullIfEmpty(formData.get("description")),
    },
  });
  revalidatePath(PAGE);
}

export async function deleteLineup(lineupId: string) {
  const user = await requireBandleader();
  await ownLineup(user.id, lineupId);
  await db.lineup.delete({ where: { id: lineupId } });
  revalidatePath(PAGE);
}

export async function addRoleToLineup(lineupId: string, formData: FormData) {
  const user = await requireBandleader();
  await ownLineup(user.id, lineupId);
  const roleId = text(formData.get("roleId"));
  if (!roleId) return;
  await ownRole(user.id, roleId);

  const count = Math.max(1, Number.parseInt(text(formData.get("count")) || "1", 10) || 1);
  const last = await db.lineupRole.findFirst({
    where: { lineupId },
    orderBy: { position: "desc" },
    select: { position: true },
  });

  // Adding a role that's already in the lineup updates its count —
  // that's what "two trumpets, actually three" means in practice.
  //
  // `pay` is only touched when the submitting form actually carried the
  // field. The inline count control on each chip posts roleId + count
  // and nothing else; without this guard, nudging a count from 2 to 3
  // would silently wipe that lineup's rate override.
  const payRaw = formData.get("pay");
  const payPatch = payRaw === null ? {} : { payCents: centsOrNull(payRaw) };

  await db.lineupRole.upsert({
    where: { lineupId_roleId: { lineupId, roleId } },
    update: { count, ...payPatch },
    create: {
      lineupId,
      roleId,
      count,
      payCents: centsOrNull(payRaw),
      position: (last?.position ?? -1) + 1,
    },
  });
  revalidatePath(PAGE);
}

// ── Applying a lineup to a gig ───────────────────────────────────

// The payoff for all of it. A lineup says "The Floor is two horns, a
// rhythm section and a singer, and the client pays $4,500"; the call
// lists say who you ring for each chair. Put those together and
// booking a gig is one dropdown instead of twelve lookups.
//
// Rules, in the order they matter:
//   • Chairs fill from the call list in call order — first call first.
//   • Somebody already on the gig FILLS their chair rather than being
//     added twice. The leader is usually already there; that shouldn't
//     make their own chair read as empty.
//   • Nobody takes two chairs in one pass.
//   • Pay comes from the lineup's rate for that role, falling back to
//     the role's default. Always editable afterwards — the rate on a
//     casino date isn't the rate on a wedding.
//   • A chair with nobody left on its call list is left UNFILLED and
//     named in the activity log. GigPersonnel requires a musician, so
//     an empty chair can't be a row; quietly handing back a short band
//     would be worse than saying so.
export async function applyLineupToGig(gigId: string, formData: FormData) {
  const user = await requireBandleader();
  const lineupId = text(formData.get("lineupId"));
  if (!lineupId) return;

  const gig = await db.gig.findFirst({
    where: { id: gigId, ownerId: user.id },
    select: { id: true, clientPayCents: true },
  });
  if (!gig) throw new Error("Gig not found");

  const lineup = await db.lineup.findFirst({
    where: { id: lineupId, ownerId: user.id },
    include: {
      roles: {
        orderBy: { position: "asc" },
        include: {
          role: {
            select: {
              id: true,
              name: true,
              defaultPayCents: true,
              members: {
                orderBy: { callOrder: "asc" },
                select: { musicianId: true },
              },
            },
          },
        },
      },
    },
  });
  if (!lineup) throw new Error("Lineup not found");

  const existing = await db.gigPersonnel.findMany({
    where: { gigId },
    select: { musicianId: true },
  });
  const onGig = new Set(existing.map((p) => p.musicianId));
  const assigned = new Set<string>();
  let position = existing.length;

  const toCreate: Array<{
    gigId: string;
    musicianId: string;
    roleId: string;
    roleLabel: string;
    payCents: number;
    position: number;
  }> = [];
  const short: string[] = [];

  for (const lr of lineup.roles) {
    const rate = lr.payCents ?? lr.role.defaultPayCents ?? 0;
    let filled = 0;
    for (const m of lr.role.members) {
      if (filled >= lr.count) break;
      if (assigned.has(m.musicianId)) continue; // already took a chair
      assigned.add(m.musicianId);
      filled++;
      if (onGig.has(m.musicianId)) continue; // already on the gig
      toCreate.push({
        gigId,
        musicianId: m.musicianId,
        roleId: lr.roleId,
        roleLabel: lr.role.name,
        payCents: rate,
        position: position++,
      });
    }
    if (filled < lr.count) {
      const missing = lr.count - filled;
      short.push(`${lr.role.name}${missing > 1 ? ` ×${missing}` : ""}`);
    }
  }

  const chairs = lineup.roles.reduce((n, lr) => n + lr.count, 0);
  const seated = chairs - short.reduce((n, s) => {
    const m = s.match(/×(\d+)$/);
    return n + (m ? Number(m[1]) : 1);
  }, 0);

  // The client price is a starting point, not an override — if you've
  // already negotiated a number for this gig, the lineup doesn't get to
  // overwrite it.
  const setsClientPay =
    lineup.clientPriceCents != null && !gig.clientPayCents;

  await db.$transaction([
    ...toCreate.map((data) => db.gigPersonnel.create({ data })),
    ...(setsClientPay
      ? [
          db.gig.update({
            where: { id: gigId },
            data: { clientPayCents: lineup.clientPriceCents },
          }),
        ]
      : []),
    db.activity.create({
      data: {
        gigId,
        action: "lineup_applied",
        summary:
          `Applied lineup "${lineup.name}" — ${seated} of ${chairs} ` +
          `${chairs === 1 ? "chair" : "chairs"} filled` +
          (short.length > 0
            ? `. Nobody on the call list for: ${short.join(", ")}`
            : "") +
          (setsClientPay
            ? `. Client price set to $${((lineup.clientPriceCents ?? 0) / 100).toFixed(2)}`
            : ""),
      },
    }),
  ]);

  revalidatePath(`/gigs/${gigId}`);
  revalidatePath(`/gigs/${gigId}/edit`);
  revalidatePath("/dashboard");
  revalidatePath("/my-gigs");
}

export async function removeRoleFromLineup(lineupRoleId: string) {
  const user = await requireBandleader();
  const row = await db.lineupRole.findFirst({
    where: { id: lineupRoleId, lineup: { ownerId: user.id } },
  });
  if (!row) throw new Error("Not found");
  await db.lineupRole.delete({ where: { id: lineupRoleId } });
  revalidatePath(PAGE);
}
