import { VenueForm } from "@/components/VenueForm";
import { requireUser } from "@/lib/session";

export default async function NewVenuePage() {
  await requireUser();
  return <VenueForm venue={null} />;
}
