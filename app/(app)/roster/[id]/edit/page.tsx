import { notFound } from "next/navigation";
import { MusicianForm } from "@/components/MusicianForm";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

export default async function EditMusicianPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const [musician, owner] = await Promise.all([
    db.musician.findFirst({ where: { id, ownerId: user.id } }),
    db.user.findUnique({
      where: { id: user.id },
      select: { enabledPaymentMethods: true },
    }),
  ]);
  if (!musician) notFound();

  return (
    <MusicianForm
      musician={musician}
      enabledPaymentMethods={owner?.enabledPaymentMethods ?? []}
    />
  );
}
