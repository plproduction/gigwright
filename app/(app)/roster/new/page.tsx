import { MusicianForm } from "@/components/MusicianForm";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

export default async function NewMusicianPage() {
  const user = await requireUser();
  const owner = await db.user.findUnique({
    where: { id: user.id },
    select: { enabledPaymentMethods: true },
  });
  return (
    <MusicianForm
      musician={null}
      enabledPaymentMethods={owner?.enabledPaymentMethods ?? []}
    />
  );
}
