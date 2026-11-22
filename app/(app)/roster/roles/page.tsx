import { redirect } from "next/navigation";

// Roles and lineups moved to /roster — they ARE the roster now, and
// the alphabetical list lives at /roster/all. Bookmarks and the
// "Roles & lineups" buttons that shipped earlier still land correctly.
export default function RolesRedirect() {
  redirect("/roster");
}
