// Canonical list of role tags for the Musician table. Displayed as
// suggestion chips on the roster edit form so bandleaders can tag
// people quickly without free-typing. The underlying Musician.roles
// field stays freeform (string[]) so anyone can still type in a role
// that isn't listed here (e.g., "Arranger", "Music Director",
// "Fiddle").
//
// PRODUCER is deliberately in this list per Patrick's design 2026-08-08:
// the client-side people who hire him get tagged in the roster with
// this role rather than living in a separate Producers table. Same
// entity, one location for all "my people."
export const SUGGESTED_ROLES = [
  "Bass",
  "Drums",
  "Guitar",
  "Piano",
  "Keys",
  "Vocals",
  "Sax",
  "Trumpet",
  "Trombone",
  "PRODUCER",
] as const;

export type SuggestedRole = (typeof SUGGESTED_ROLES)[number];
