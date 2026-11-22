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

export async function removeRoleFromLineup(lineupRoleId: string) {
  const user = await requireBandleader();
  const row = await db.lineupRole.findFirst({
    where: { id: lineupRoleId, lineup: { ownerId: user.id } },
  });
  if (!row) throw new Error("Not found");
  await db.lineupRole.delete({ where: { id: lineupRoleId } });
  revalidatePath(PAGE);
}
