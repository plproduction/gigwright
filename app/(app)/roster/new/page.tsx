import { MusicianForm } from "@/components/MusicianForm";
import { requireUser } from "@/lib/session";

export default async function NewMusicianPage() {
  await requireUser();
  return <MusicianForm musician={null} />;
}
