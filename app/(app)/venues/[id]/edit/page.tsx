import { notFound } from "next/navigation";
import { VenueForm } from "@/components/VenueForm";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

export default async function EditVenuePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const venue = await db.venue.findFirst({
    where: { id, ownerId: user.id },
  });
  if (!venue) notFound();

  return <VenueForm venue={venue} />;
}
