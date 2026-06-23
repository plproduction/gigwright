import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { formatLongDate, formatTime } from "@/lib/format";

type Params = { id: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { id } = await params;
  const gig = await db.gig.findUnique({
    where: { id },
    include: { venue: true },
  });
  return {
    title: `Door list · ${gig?.venue?.name ?? "Gig"} · GigWright`,
  };
}

// Venue door-handoff list. Auth-gated to the bandleader; never public.
// Renders ONLY approved guest names across every musician (and the
// leader's own row), alphabetized, with the gig header at the top so
// the door staff knows what they're looking at. Print CSS strips the
// chrome — the bandleader hits Cmd-P (or the on-page Print button)
// and gets a clean letter-sized sheet.
export default async function PrintDoorListPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const gig = await db.gig.findFirst({
    where: { id, ownerId: user.id },
    include: {
      venue: true,
      personnel: {
        select: {
          id: true,
          approvedGuests: true,
          musician: { select: { name: true, isLeader: true } },
        },
      },
    },
  });
  if (!gig) notFound();

  // Flatten + dedupe (case-insensitive) every approved name across all
  // personnel rows. Build a {displayName, submittedBy} record for each
  // unique name so duplicates collapse to a single door entry with all
  // contributors listed in small type underneath.
  const seen = new Map<
    string,
    { display: string; submittedBy: string[] }
  >();
  for (const p of gig.personnel) {
    for (const raw of p.approvedGuests) {
      const display = raw.trim();
      if (display === "") continue;
      const key = display.toLowerCase();
      const existing = seen.get(key);
      if (existing) {
        existing.submittedBy.push(p.musician.name);
      } else {
        seen.set(key, { display, submittedBy: [p.musician.name] });
      }
    }
  }
  // Alphabetize by the display string. en-US collation handles names
  // with accents/punctuation gracefully.
  const guests = Array.from(seen.values()).sort((a, b) =>
    a.display.localeCompare(b.display, "en-US", { sensitivity: "base" }),
  );

  const venueName = gig.venue?.name ?? "Venue TBD";
  const eventLabel = gig.eventName ? `${gig.eventName} · ${venueName}` : venueName;

  return (
    <div className="print-root">
      <style>{`
        .print-root {
          background: #f5f5f5;
          min-height: 100vh;
          padding: 24px 0;
          color: #1a1a1a;
          font-family: Georgia, "Times New Roman", serif;
        }
        .print-sheet {
          background: white;
          width: 8.5in;
          max-width: 100%;
          margin: 0 auto;
          padding: 0.7in 0.8in;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          box-sizing: border-box;
        }
        .print-bar {
          max-width: 8.5in;
          margin: 0 auto 16px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0 8px;
          font-family: -apple-system, BlinkMacSystemFont, sans-serif;
          font-size: 12px;
        }
        .print-bar button, .print-bar a {
          padding: 6px 14px;
          border: 1px solid #d6d0c0;
          border-radius: 6px;
          background: #fff;
          color: #1a1a1a;
          text-decoration: none;
          font-weight: 600;
          font-size: 12px;
          cursor: pointer;
        }
        .print-bar button:hover, .print-bar a:hover {
          border-color: #7E2418;
          color: #7E2418;
        }
        .ps-eyebrow {
          font-family: Georgia, serif;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: #7E2418;
        }
        .ps-h1 {
          font-family: Georgia, serif;
          font-size: 34px;
          font-weight: 400;
          letter-spacing: -0.02em;
          margin: 4px 0 6px;
          line-height: 1.05;
        }
        .ps-sub {
          font-family: Georgia, serif;
          font-size: 14px;
          color: #4A453C;
          margin: 2px 0;
        }
        .gold-rule {
          width: 36px;
          height: 1px;
          background: #A88B4A;
          margin: 18px 0;
        }
        .name-count {
          font-family: -apple-system, BlinkMacSystemFont, sans-serif;
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: #8A8576;
          margin-bottom: 14px;
        }
        .name-row {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          padding: 11px 0;
          border-bottom: 1px solid #ECE6D6;
        }
        .name-row:last-child {
          border-bottom: none;
        }
        .name-text {
          font-family: Georgia, serif;
          font-size: 19px;
          color: #1A1410;
          line-height: 1.2;
        }
        .name-meta {
          font-family: -apple-system, BlinkMacSystemFont, sans-serif;
          font-size: 10px;
          font-style: italic;
          color: #8A8576;
        }
        .empty {
          font-family: Georgia, serif;
          font-size: 14px;
          font-style: italic;
          color: #8A8576;
          text-align: center;
          padding: 40px 0;
        }
        .footer {
          margin-top: 32px;
          padding-top: 16px;
          border-top: 1px solid #ECE6D6;
          font-family: -apple-system, BlinkMacSystemFont, sans-serif;
          font-size: 10px;
          color: #8A8576;
          text-align: center;
        }
        @page {
          size: letter portrait;
          margin: 0;
        }
        @media print {
          .print-root {
            background: white;
            padding: 0;
          }
          .print-bar { display: none; }
          .print-sheet { box-shadow: none; padding: 0.55in 0.6in; }
        }
      `}</style>

      <div className="print-bar">
        <Link href={`/gigs/${gig.id}`}>← Back to gig</Link>
        <PrintButton />
      </div>

      <div className="print-sheet">
        <div className="ps-eyebrow">Door list</div>
        <h1 className="ps-h1">{eventLabel}</h1>
        <div className="ps-sub">
          {formatLongDate(gig.startAt)} · Downbeat {formatTime(gig.startAt)}
        </div>
        <div className="gold-rule" />
        <div className="name-count">
          {guests.length}{" "}
          {guests.length === 1 ? "name on the list" : "names on the list"}
        </div>

        {guests.length === 0 ? (
          <div className="empty">
            No names approved yet for this gig.
          </div>
        ) : (
          <div>
            {guests.map((g) => (
              <div key={g.display} className="name-row">
                <span className="name-text">{g.display}</span>
                <span className="name-meta">
                  via {g.submittedBy.join(", ")}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="footer">
          GigWright · printed for {venueName}
        </div>
      </div>
    </div>
  );
}

function PrintButton() {
  // A tiny <form action="javascript:..."> is the only way to fire
  // window.print() without rendering a Client Component — kept the
  // whole page server-side so it's fast and SEO-clean.
  return (
    <form
      action="javascript:window.print()"
      style={{ margin: 0, display: "inline" }}
    >
      <button type="submit">Print this sheet</button>
    </form>
  );
}
