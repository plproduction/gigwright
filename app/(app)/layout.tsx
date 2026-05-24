import { AppNav } from "@/components/AppNav";
import { requireBandleader, initialsFor } from "@/lib/session";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Bandleader-only shell. Musicians (role === MUSICIAN) get redirected
  // to /my-gigs by requireBandleader so they don't see the leader's
  // Gigs / Roster / Venues / Finance / Settings nav by accident — that
  // was the bug a musician reported when their account appeared with
  // a "Payment methods you accept" panel that's leader-only.
  const user = await requireBandleader();
  const initials = initialsFor(user.name || user.email);

  return (
    <div className="min-h-screen bg-paper">
      {/* Responsive outer padding — 16px on phones, 32px on desktop. */}
      <div className="mx-auto max-w-[1240px] px-4 py-5 md:px-8 md:py-10">
        <section className="overflow-hidden rounded-[10px] border border-line bg-surface">
          <AppNav userInitials={initials} />
          {/* Inner padding also scales down on mobile so the content has room
              to breathe and doesn't get chopped by the shell. */}
          <div className="px-4 pb-6 pt-5 md:px-8 md:pb-9 md:pt-7">{children}</div>
        </section>
      </div>
    </div>
  );
}
