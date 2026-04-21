import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";

// Resolve the current session, looking up the User row by email (since our
// JWT strategy carries email but not the internal user ID).
// Creates the User row on first sign-in if it doesn't exist yet.
export async function requireUser() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) redirect("/signin");

  const user = await db.user.upsert({
    where: { email },
    update: {},
    create: { email },
  });

  return user;
}

export function initialsFor(nameOrEmail?: string | null): string {
  if (!nameOrEmail) return "•";
  const trimmed = nameOrEmail.trim();
  if (!trimmed) return "•";
  // If it's an email, use the first letter of the local part
  if (trimmed.includes("@")) {
    return trimmed[0]!.toUpperCase();
  }
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}
