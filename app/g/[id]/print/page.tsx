import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import {
  formatLongDate,
  formatTime,
  formatYear,
} from "@/lib/format";

type Params = { id: string };

// One-page printable gig sheet — designed for 8.5×11 letter / A4 paper.
// Linked from the band-facing email so musicians can print a single sheet
// to clip to a music stand or pin to a fridge. Pulled out of the regular
// /g/[id] public sheet because that one's optimized for screen and has too
// much visual weight to print cleanly.
//
// Permission design same as /g/[id]: no auth, gig id (cuid) is the
// capability. Robots disabled.

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { id } = await params;
  const gig = await db.gig.findUnique({
    where: { id },
    select: { venue: { select: { name: true } }, startAt: true },
  });
  if (!gig) return { title: "Gig not found" };
  const name = gig.venue?.name ?? "Gig";
  return {
    title: `${name} · ${formatLongDate(gig.startAt)} · Print sheet`,
    robots: { index: false, follow: false },
  };
}

export default async function PrintableGigSheet({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id } = await params;

  const gig = await db.gig.findUnique({
    where: { id },
    select: {
      id: true,
      startAt: true,
      loadInAt: true,
      soundcheckAt: true,
      soundcheckEndAt: true,
      callTimeAt: true,
      endAt: true,
      secondStartAt: true,
      secondEndAt: true,
      sound: true,
      soundContactName: true,
      soundContactPhone: true,
      lights: true,
      attire: true,
      meal: true,
      notes: true,
      loadingInfo: true,
      setlistUrl: true,
      stagePlotUrl: true,
      materialsUrl: true,
      venue: {
        select: {
          name: true,
          addressL1: true,
          addressL2: true,
          city: true,
          state: true,
          postalCode: true,
          phone: true,
        },
      },
      personnel: {
        select: {
          musician: {
            select: {
              name: true,
              roles: true,
              phone: true,
              isLeader: true,
            },
          },
          position: true,
          includeInLineup: true,
        },
        orderBy: { position: "asc" },
      },
    },
  });

  if (!gig) notFound();

  // Only show musicians flagged for the outbound lineup, matching the
  // email — what's in the band-facing email and what's on paper should
  // be the same set of people.
  const lineup = gig.personnel.filter((p) => p.includeInLineup);

  const venueLines = [
    gig.venue?.addressL1,
    gig.venue?.addressL2,
    gig.venue?.city && gig.venue?.state
      ? `${gig.venue.city}, ${gig.venue.state} ${gig.venue.postalCode ?? ""}`.trim()
      : null,
  ].filter(Boolean) as string[];

  const dow = gig.startAt.toLocaleDateString("en-US", { weekday: "long" });

  return (
    <div className="print-root">
      <style>{`
        /* Screen styles — readable preview before printing */
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
          padding: 0.55in 0.6in;
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
        }
        .print-bar a, .print-bar button {
          font-size: 13px;
          color: #6B1F15;
          background: white;
          border: 1px solid #6B1F15;
          padding: 6px 14px;
          border-radius: 4px;
          text-decoration: none;
          cursor: pointer;
          font-family: inherit;
        }
        .print-bar a:hover, .print-bar button:hover {
          background: #6B1F15;
          color: white;
        }
        /* Sheet content */
        .ps-eyebrow {
          font-size: 9.5px;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          font-weight: 600;
          color: #6B1F15;
          font-family: -apple-system, BlinkMacSystemFont, sans-serif;
        }
        .ps-h1 {
          font-size: 26px;
          font-weight: 300;
          letter-spacing: -0.01em;
          line-height: 1.05;
          margin: 4px 0 2px;
        }
        .ps-h2 {
          font-size: 10px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          font-weight: 600;
          color: #6B1F15;
          font-family: -apple-system, BlinkMacSystemFont, sans-serif;
          margin: 12px 0 6px;
          border-bottom: 0.5px solid #d4c8a8;
          padding-bottom: 4px;
        }
        .ps-subline {
          font-size: 13px;
          color: #4a4a4a;
        }
        .ps-row {
          display: flex;
          padding: 2px 0;
          font-size: 12px;
          line-height: 1.4;
        }
        .ps-label {
          flex: 0 0 110px;
          font-size: 10px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          font-weight: 600;
          color: #6a6a6a;
          font-family: -apple-system, BlinkMacSystemFont, sans-serif;
          padding-top: 1px;
        }
        .ps-value {
          flex: 1;
          color: #1a1a1a;
        }
        .ps-value-strong {
          font-weight: 600;
        }
        .ps-grid-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0 24px;
        }
        .ps-attach {
          font-size: 10px;
          color: #6a6a6a;
          padding: 2px 0;
          font-family: -apple-system, BlinkMacSystemFont, sans-serif;
        }
        .ps-foot {
          margin-top: 14px;
          padding-top: 8px;
          border-top: 0.5px solid #d4c8a8;
          font-size: 9.5px;
          color: #888;
          text-align: center;
          letter-spacing: 0.1em;
          font-family: -apple-system, BlinkMacSystemFont, sans-serif;
        }
        /* Print overrides */
        @media print {
          @page {
            size: letter portrait;
            margin: 0;
          }
          html, body, .print-root {
            background: white;
            padding: 0;
            margin: 0;
          }
          .print-bar { display: none; }
          .print-sheet {
            width: 100%;
            max-width: none;
            box-shadow: none;
            padding: 0.5in 0.55in;
          }
        }
      `}</style>

      <div className="print-bar">
        <span style={{ fontSize: 13, color: "#888" }}>
          Press <strong style={{ color: "#1a1a1a" }}>⌘P</strong> (Mac) or{" "}
          <strong style={{ color: "#1a1a1a" }}>Ctrl+P</strong> to print this
          sheet · Save as PDF works too
        </span>
        <a href={`/g/${gig.id}`}>Open full gig sheet ↗</a>
      </div>

      <div className="print-sheet">
        {/* Header */}
        <div>
          <div className="ps-eyebrow">Gig sheet · {dow}</div>
          <h1 className="ps-h1">{gig.venue?.name ?? "Gig"}</h1>
          <div className="ps-subline">
            {formatLongDate(gig.startAt)}, {formatYear(gig.startAt)}
          </div>
        </div>

        {/* Schedule */}
        <div>
          <div className="ps-h2">Schedule</div>
          <div className="ps-grid-2">
            <ScheduleRow label="Load in" time={gig.loadInAt} />
            <ScheduleRow label="Sound check" time={gig.soundcheckAt} />
            <ScheduleRow
              label="Check complete"
              time={gig.soundcheckEndAt}
            />
            <ScheduleRow label="Call" time={gig.callTimeAt} />
            <ScheduleRow
              label={gig.secondStartAt ? "1st downbeat" : "Downbeat"}
              time={gig.startAt}
              emphasize
            />
            <ScheduleRow
              label={gig.secondStartAt ? "1st finish" : "Finish"}
              time={gig.endAt}
            />
            {gig.secondStartAt && (
              <ScheduleRow
                label="2nd downbeat"
                time={gig.secondStartAt}
                emphasize
              />
            )}
            {gig.secondEndAt && (
              <ScheduleRow label="2nd finish" time={gig.secondEndAt} />
            )}
          </div>
        </div>

        {/* Venue */}
        {gig.venue && (
          <div>
            <div className="ps-h2">Venue</div>
            <div className="ps-row">
              <div className="ps-value ps-value-strong">{gig.venue.name}</div>
            </div>
            {venueLines.map((line) => (
              <div className="ps-row" key={line}>
                <div className="ps-value">{line}</div>
              </div>
            ))}
            {gig.venue.phone && (
              <div className="ps-row">
                <div className="ps-label">Phone</div>
                <div className="ps-value">{gig.venue.phone}</div>
              </div>
            )}
          </div>
        )}

        {/* Tech & Attire */}
        {(gig.sound ||
          gig.soundContactName ||
          gig.soundContactPhone ||
          gig.lights ||
          gig.attire ||
          gig.meal) && (
          <div>
            <div className="ps-h2">Tech & attire</div>
            {gig.sound && <Field label="Sound" value={gig.sound} />}
            {(gig.soundContactName || gig.soundContactPhone) && (
              <Field
                label="Sound guy"
                value={[gig.soundContactName, gig.soundContactPhone]
                  .filter(Boolean)
                  .join(" · ")}
              />
            )}
            {gig.lights && <Field label="Lights" value={gig.lights} />}
            {gig.attire && <Field label="Attire" value={gig.attire} />}
            {gig.meal && <Field label="Meal" value={gig.meal} />}
          </div>
        )}

        {/* Lineup */}
        {lineup.length > 0 && (
          <div>
            <div className="ps-h2">Lineup</div>
            {lineup.map((p) => {
              const roleLine = [
                p.musician.isLeader ? "Leader" : null,
                p.musician.roles.length ? p.musician.roles.join(", ") : null,
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <div className="ps-row" key={p.musician.name + p.position}>
                  <div
                    className="ps-value"
                    style={{ display: "flex", justifyContent: "space-between", gap: 12 }}
                  >
                    <span>
                      <span className="ps-value-strong">{p.musician.name}</span>
                      {roleLine && (
                        <span style={{ color: "#6a6a6a" }}> · {roleLine}</span>
                      )}
                    </span>
                    {p.musician.phone && (
                      <span style={{ color: "#1a1a1a", whiteSpace: "nowrap" }}>
                        {p.musician.phone}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Loading instructions */}
        {gig.loadingInfo && (
          <div>
            <div className="ps-h2">Special loading instructions</div>
            <div className="ps-row">
              <div className="ps-value">{gig.loadingInfo}</div>
            </div>
          </div>
        )}

        {/* Notes (condensed if present) */}
        {gig.notes && (
          <div>
            <div className="ps-h2">Notes</div>
            <div className="ps-row">
              <div className="ps-value" style={{ whiteSpace: "pre-wrap" }}>
                {gig.notes}
              </div>
            </div>
          </div>
        )}

        {/* Attachments — bottom of sheet, just URLs as text so a printed
            copy still tells you where to fetch the setlist / stage plot
            from a different device. */}
        {(gig.setlistUrl || gig.stagePlotUrl || gig.materialsUrl) && (
          <div>
            <div className="ps-h2">Attachments</div>
            {gig.setlistUrl && (
              <div className="ps-attach">
                Set list · {gig.setlistUrl}
              </div>
            )}
            {gig.stagePlotUrl && (
              <div className="ps-attach">
                Stage plot · {gig.stagePlotUrl}
              </div>
            )}
            {gig.materialsUrl && (
              <div className="ps-attach">
                Gig materials · {gig.materialsUrl}
              </div>
            )}
          </div>
        )}

        <div className="ps-foot">gigwright.com · gig sheet · {gig.id.slice(-6).toUpperCase()}</div>
      </div>
    </div>
  );
}

function ScheduleRow({
  label,
  time,
  emphasize,
}: {
  label: string;
  time: Date | null;
  emphasize?: boolean;
}) {
  if (!time) return null;
  return (
    <div className="ps-row">
      <div className="ps-label">{label}</div>
      <div
        className={emphasize ? "ps-value ps-value-strong" : "ps-value"}
        style={
          emphasize
            ? { color: "#6B1F15", fontFamily: "Georgia, serif", fontSize: 13 }
            : undefined
        }
      >
        {formatTime(time)}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="ps-row">
      <div className="ps-label">{label}</div>
      <div className="ps-value">{value}</div>
    </div>
  );
}
