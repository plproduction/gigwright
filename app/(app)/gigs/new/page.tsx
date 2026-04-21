import { GigForm } from "@/components/GigForm";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

export default async function NewGigPage() {
  const user = await requireUser();
  const [venues, musicians] = await Promise.all([
    db.venue.findMany({ where: { ownerId: user.id }, orderBy: { name: "asc" } }),
    db.musician.findMany({
      where: { ownerId: user.id },
      orderBy: [{ isLeader: "desc" }, { name: "asc" }],
    }),
  ]);
  return <GigForm gig={null} venues={venues} musicians={musicians} />;
}
