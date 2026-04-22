import { MusicianNav } from "@/components/MusicianNav";
import { requireMusician } from "@/lib/session";
import { initialsFor } from "@/lib/session";

export default async function MusicianLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireMusician();
  const initials = initialsFor(user.name || user.email);

  return (
    <div className="min-h-screen bg-paper">
      <div className="mx-auto max-w-[1240px] px-8 py-10">
        <section className="overflow-hidden rounded-[10px] border border-line bg-surface">
          <MusicianNav userInitials={initials} />
          <div className="px-8 pb-9 pt-7">{children}</div>
        </section>
      </div>
    </div>
  );
}
