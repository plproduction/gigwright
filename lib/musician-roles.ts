// A musician's roles are their call-list memberships — there is no
// Musician.roles column any more. Everything that wants to show "Sax,
// Arranger" next to a name pulls it through here so the selects and
// the ordering stay identical across the app.

// Spread into a Prisma `select` or `include` on Musician.
// Ordered by the role's own position, so a musician's roles read in
// the same order as the Band page lists them.
export const WITH_ROLES = {
  callLists: {
    orderBy: { role: { position: "asc" } },
    select: { note: true, role: { select: { id: true, name: true } } },
  },
} as const;

export type MusicianWithRoles = {
  callLists: { note: string | null; role: { id: string; name: string } }[];
};

export function roleNames(m: MusicianWithRoles): string[] {
  return m.callLists.map((c) => c.role.name);
}

// The detail the old free-text roles carried besides the instrument —
// "Miami", "referred by Greg Parnell", "Prince tribute". Kept separate
// from the role name so the Band page can group by role, and folded into
// the search haystack so typing "miami" still finds a Miami bass player.
// That worked before the cleanup only because the role was literally
// named "Bass Miami"; it has to be deliberate now.
export function roleNotes(m: MusicianWithRoles): string[] {
  return m.callLists.map((c) => c.note).filter((x): x is string => Boolean(x));
}

// "Bass · Miami" — what a human wants to read in a search result or on a
// roster row. Falls back to the bare role name when there's no note.
export function roleLabels(m: MusicianWithRoles): string[] {
  return m.callLists.map((c) =>
    c.note ? `${c.role.name} · ${c.note}` : c.role.name,
  );
}

// Several places print "Leader" from the isLeader flag and then the role
// list right after it. Plenty of bandleaders also keep a role actually
// called Leader, which made gig sheets read "Patrick Lamb · Leader ·
// Leader, Sax, Vocals". Drop the duplicate when the flag already said it.
export function roleNamesBesidesLeader(
  m: MusicianWithRoles & { isLeader: boolean },
): string[] {
  const names = roleNames(m);
  if (!m.isLeader) return names;
  return names.filter((n) => n.toLowerCase() !== "leader");
}

// The one role that isn't a chair on the stand: PRODUCER tags the
// client-side people who hire the band. Kept as an ordinary Role so
// there's still one list of "my people", but grouped separately in
// the UI. Patrick's design 2026-08-08, carried over from the old
// free-text roles.
export const PRODUCER_ROLE = "Event Producer";

// Matches the canonical "Event Producer" and the older free-text spellings
// ("PRODUCER", "Producer") that predate the 2026-11-24 cleanup. Without the
// second case this silently stopped grouping producers the moment the role
// was renamed, because "EVENT PRODUCER" !== "PRODUCER".
export function isProducerRole(name: string): boolean {
  const upper = name.toUpperCase();
  return upper === "EVENT PRODUCER" || upper === "PRODUCER";
}

export function isProducer(m: MusicianWithRoles): boolean {
  return m.callLists.some((c) => isProducerRole(c.role.name));
}
