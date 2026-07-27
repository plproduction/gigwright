import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

// Producer rolodex — the client-side people who book Patrick's gigs.
// Populated automatically by the contract-extraction flow (client
// signatory becomes a Producer row on gig save) and by any manual
// producer edits from the /producers/[id] edit page.
export default async function ProducersPage() {
  const user = await requireUser();
  const producers = await db.producer.findMany({
    where: { ownerId: user.id },
    orderBy: { name: "asc" },
    include: { _count: { select: { gigs: true } } },
  });

  return (
    <>
      <div className="mb-5 flex items-center gap-2 border-b border-line pb-3">
        <h4 className="font-serif text-[20px] font-normal tracking-tight">
          Producers
        </h4>
        <span className="text-[12px] text-ink-mute">
          · {producers.length}
        </span>
      </div>

      {producers.length === 0 ? (
        <div className="py-12 text-center text-[13px] text-ink-mute">
          No producers yet. They&apos;ll appear here automatically when
          you upload a signed contract on{" "}
          <Link
            href="/gigs/new/from-contract"
            className="text-accent hover:underline"
          >
            New gig from contract
          </Link>
          .
        </div>
      ) : (
        <div className="grid grid-cols-[2fr_2fr_2fr_80px_80px] gap-4 text-[13px]">
          <div className="col-span-5 grid grid-cols-[2fr_2fr_2fr_80px_80px] gap-4 border-b border-line-strong px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-mute">
            <div>Name</div>
            <div>Company</div>
            <div>Contact</div>
            <div className="text-right">Gigs</div>
            <div></div>
          </div>
          {producers.map((p) => (
            <Link
              key={p.id}
              href={`/producers/${p.id}`}
              className="col-span-5 grid grid-cols-[2fr_2fr_2fr_80px_80px] items-center gap-4 border-b border-line px-2 py-3 hover:bg-paper-warm"
            >
              <div className="font-serif text-[17px]">{p.name}</div>
              <div className="text-ink-soft">{p.company ?? ""}</div>
              <div className="truncate text-ink-soft">
                {[p.email, p.phone].filter(Boolean).join(" · ")}
              </div>
              <div className="text-right font-serif tabular-nums">
                {p._count.gigs}
              </div>
              <div className="text-right text-[12px] text-accent">Edit →</div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
