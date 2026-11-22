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
    select: { role: { select: { id: true, name: true } } },
  },
} as const;

export type MusicianWithRoles = {
  callLists: { role: { id: string; name: string } }[];
};

export function roleNames(m: MusicianWithRoles): string[] {
  return m.callLists.map((c) => c.role.name);
}

// The one role that isn't a chair on the stand: PRODUCER tags the
// client-side people who hire the band. Kept as an ordinary Role so
// there's still one list of "my people", but grouped separately in
// the UI. Patrick's design 2026-08-08, carried over from the old
// free-text roles.
export const PRODUCER_ROLE = "PRODUCER";

export function isProducerRole(name: string): boolean {
  return name.toUpperCase() === PRODUCER_ROLE;
}

export function isProducer(m: MusicianWithRoles): boolean {
  return m.callLists.some((c) => isProducerRole(c.role.name));
}
