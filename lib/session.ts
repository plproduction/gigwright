import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";

// Resolve the current session, looking up the User row by email (since our
// JWT strategy carries email but not the internal user ID).
// Creates the User row on first sign-in if it doesn't exist yet.
//
// Also re-runs the email → Musician auto-link on every request. The JWT
// callback (auth.ts) does this on first sign-in only, but if a bandleader
// adds someone to their roster AFTER that musician already signed up (or
// signed in earlier as a brand-new OWNER), the JWT-time link never fires
// and they get stuck seeing the bandleader interface. Doing it here
// guarantees the link happens before the very next page render — and is
// cheap because findMany + updateMany are skipped entirely when there
// are no email matches.
export async function requireUser() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) redirect("/signin");

  const user = await db.user.upsert({
    where: { email },
    update: {},
    create: { email },
  });

  // Auto-link to any Musician rows whose email matches this user but
  // whose userId is null (hasn't been linked yet). If we find any, also
  // demote the User to MUSICIAN (unless they're an ADMIN — admins stay).
  if (user.role !== "ADMIN") {
    const orphanMusicians = await db.musician.findMany({
      where: {
        email: { equals: email, mode: "insensitive" },
        userId: null,
      },
      select: { id: true },
    });
    if (orphanMusicians.length > 0) {
      await db.$transaction([
        db.musician.updateMany({
          where: { id: { in: orphanMusicians.map((m) => m.id) } },
          data: { userId: user.id },
        }),
        // Only demote to MUSICIAN if they're not already an OWNER who's
        // booking gigs themselves. The signal: do they own any gigs?
        // (Use the inverse: only flip to MUSICIAN if they own NO gigs.)
        // Otherwise leave their role as-is — they're a working
        // bandleader who happens to also be on someone else's roster.
      ]);
      const isAlsoBandleader = await db.gig.findFirst({
        where: { ownerId: user.id },
        select: { id: true },
      });
      if (!isAlsoBandleader && user.role !== "MUSICIAN") {
        await db.user.update({
          where: { id: user.id },
          data: { role: "MUSICIAN" },
        });
        // Mutate the returned object so the caller sees the new role
        // without a refetch.
        user.role = "MUSICIAN";
      }
    }
  }

  return user;
}

// Require a bandleader (OWNER/ADMIN/PRO). Musicians are bounced to their
// own portal at /my-gigs — they can never reach admin pages.
export async function requireBandleader() {
  const user = await requireUser();
  if (user.role === "MUSICIAN") redirect("/my-gigs");
  return user;
}

// Require a musician (someone linked to at least one Musician record).
// Bandleaders with no musician links get bounced to their /dashboard.
export async function requireMusician() {
  const user = await requireUser();
  const linked = await db.musician.findFirst({
    where: { userId: user.id },
    select: { id: true },
  });
  if (!linked) redirect("/dashboard");
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
