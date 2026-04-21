import { notFound } from "next/navigation";
import { GigForm } from "@/components/GigForm";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

export default async function EditGigPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const [gig, venues, musicians] = await Promise.all([
    db.gig.findFirst({
      where: { id, ownerId: user.id },
      include: {
        personnel: {
          include: { musician: true },
          orderBy: { position: "asc" },
        },
      },
    }),
    db.venue.findMany({ where: { ownerId: user.id }, orderBy: { name: "asc" } }),
    db.musician.findMany({
      where: { ownerId: user.id },
      orderBy: [{ isLeader: "desc" }, { name: "asc" }],
    }),
  ]);
  if (!gig) notFound();

  return <GigForm gig={gig} venues={venues} musicians={musicians} />;
}
