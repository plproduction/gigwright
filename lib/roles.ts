// The chairs most bands book. Used once, to lay down a starting set of
// real Role rows for a bandleader whose Band page is empty — see
// seedSuggestedRoles(). After that they're ordinary roles: rename them,
// re-order them, delete the ones you don't book, add your own.
//
// This is NOT a constraint on what a role can be. Anything can be a
// role ("Arranger", "Music Director", "Sound Tech", "Fiddle"); it just
// gets typed in rather than coming from here.
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
