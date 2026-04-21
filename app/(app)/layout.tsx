import { AppNav } from "@/components/AppNav";
import { requireUser, initialsFor } from "@/lib/session";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const initials = initialsFor(user.name || user.email);

  return (
    <div className="min-h-screen bg-paper">
      <div className="mx-auto max-w-[1240px] px-8 py-10">
        <section className="overflow-hidden rounded-[10px] border border-line bg-surface">
          <AppNav userInitials={initials} />
          <div className="px-8 pb-9 pt-7">{children}</div>
        </section>
      </div>
    </div>
  );
}
