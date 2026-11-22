import { MusicianForm } from "@/components/MusicianForm";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

export default async function NewMusicianPage() {
  const user = await requireUser();
  const [owner, allRoles] = await Promise.all([
    db.user.findUnique({
      where: { id: user.id },
      select: { enabledPaymentMethods: true },
    }),
    db.role.findMany({
      where: { ownerId: user.id },
      orderBy: { position: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  return (
    <MusicianForm
      musician={null}
      enabledPaymentMethods={owner?.enabledPaymentMethods ?? []}
      allRoles={allRoles}
      selectedRoleIds={[]}
    />
  );
}
