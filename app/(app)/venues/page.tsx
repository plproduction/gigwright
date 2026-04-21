import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

export default async function VenuesPage() {
  const user = await requireUser();
  const venues = await db.venue.findMany({
    where: { ownerId: user.id },
    orderBy: { name: "asc" },
    include: { _count: { select: { gigs: true } } },
  });

  return (
    <>
      <div className="mb-5 flex items-center gap-2 border-b border-line pb-3">
        <h4 className="font-serif text-[20px] font-normal tracking-tight">Venues</h4>
        <span className="text-[12px] text-ink-mute">· {venues.length}</span>
        <Link
          href="/venues/new"
          className="ml-auto rounded-md bg-ink px-3 py-1.5 text-[12px] font-medium text-paper hover:bg-black"
        >
          + New venue
        </Link>
      </div>

      {venues.length === 0 ? (
        <div className="py-12 text-center text-[13px] text-ink-mute">
          No venues yet.{" "}
          <Link href="/venues/new" className="text-accent hover:underline">
            Add one
          </Link>
          .
        </div>
      ) : (
        <div className="grid grid-cols-[2fr_2fr_80px_80px] gap-4 text-[13px]">
          <div className="col-span-4 grid grid-cols-[2fr_2fr_80px_80px] gap-4 border-b border-line-strong px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-mute">
            <div>Name</div>
            <div>Location</div>
            <div className="text-right">Gigs</div>
            <div></div>
          </div>
          {venues.map((v) => (
            <Link
              key={v.id}
              href={`/venues/${v.id}/edit`}
              className="col-span-4 grid grid-cols-[2fr_2fr_80px_80px] items-center gap-4 border-b border-line px-2 py-3 hover:bg-paper-warm"
            >
              <div className="font-serif text-[17px]">{v.name}</div>
              <div className="text-ink-soft">
                {[v.addressL1, [v.city, v.state].filter(Boolean).join(", ")]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
              <div className="text-right font-serif tabular-nums">
                {v._count.gigs}
              </div>
              <div className="text-right text-[12px] text-accent">Edit →</div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
