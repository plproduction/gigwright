import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { formatLongDate } from "@/lib/format";
import { Linkify } from "@/components/Linkify";

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
    title: `Message history · ${gig?.venue?.name ?? "Gig"} · GigWright`,
  };
}

// Message history / accountability log for a gig. Every time the
// bandleader fired "Send update," we wrote an Activity row with
// action=fanout_sent and a full payload. This page reads those rows
// back and renders each one as a card: trigger label, message body,
// recipient counts, and specific error details if anything failed to
// deliver. So when a musician says "I never got the message about
// the time change," the bandleader can open this page, see the exact
// timestamp, and say "actually I sent it Tuesday at 4:32 — here's the
// list of people it went to."
export default async function GigMessagesPage({
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
      activity: {
        where: { action: "fanout_sent" },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!gig) notFound();

  const venueName = gig.venue?.name ?? "Gig";

  return (
    <div className="-mx-8 -mb-9 -mt-7">
      <div className="border-b border-line bg-paper-warm px-7 py-5">
        <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-ink-mute">
          <Link href={`/gigs/${gig.id}`} className="hover:text-accent">
            ← Back to gig
          </Link>
        </div>
        <h4 className="mt-2 font-serif text-[22px] font-normal tracking-tight">
          Message history
        </h4>
        <p className="mt-0.5 text-[13px] text-ink-soft">
          {venueName} · {formatLongDate(gig.startAt)}
        </p>
      </div>

      <div className="px-7 py-6">
        {gig.activity.length === 0 ? (
          <div className="rounded-md border border-dashed border-line-strong bg-paper-warm/40 p-8 text-center">
            <div className="font-serif text-[16px] italic text-ink-mute">
              No messages sent yet for this gig.
            </div>
            <div className="mt-1 text-[12px] text-ink-mute">
              Every time you fire &ldquo;Send update,&rdquo; a record lands
              here — trigger, message body, and who got what.
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-mute">
              {gig.activity.length}{" "}
              {gig.activity.length === 1 ? "message" : "messages"} · newest first
            </div>
            {gig.activity.map((a) => {
              // Payload shape is what fanoutGigUpdate writes: triggerLabel,
              // message, emailsSent, emailsSkipped, smsSent, smsSkipped,
              // recipients (string[]), errors (array of {name, channel,
              // message}), includeLeader. Older rows may lack the message
              // field — we degrade gracefully.
              const p =
                (a.payload as {
                  triggerLabel?: string | null;
                  message?: string | null;
                  emailsSent?: number;
                  emailsSkipped?: number;
                  smsSent?: number;
                  smsSkipped?: number;
                  recipients?: string[];
                  errors?: Array<{
                    name: string;
                    channel?: string;
                    message: string;
                  }>;
                  includeLeader?: boolean;
                }) ?? {};
              return (
                <div
                  key={a.id}
                  className="rounded-[10px] border border-line bg-paper shadow-[0_1px_2px_rgba(14,12,9,0.04)]"
                >
                  {/* Card header — timestamp + trigger label + channel
                      totals in one line so the bandleader can scan the
                      history at a glance. */}
                  <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-line bg-paper-warm/40 px-4 py-2.5">
                    <div className="flex items-baseline gap-3">
                      <span className="font-serif text-[13px] text-ink">
                        {a.createdAt.toLocaleString("en-US", {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </span>
                      {p.triggerLabel && (
                        <span className="font-serif text-[13px] italic text-accent">
                          {p.triggerLabel}
                        </span>
                      )}
                    </div>
                    <div className="text-[10.5px] font-medium tabular-nums text-ink-mute">
                      <span className="font-semibold text-ink-soft">
                        {p.emailsSent ?? 0}
                      </span>{" "}
                      emailed
                      <span className="mx-1.5 text-ink-mute/60">·</span>
                      <span className="font-semibold text-ink-soft">
                        {p.smsSent ?? 0}
                      </span>{" "}
                      texted
                      {p.errors && p.errors.length > 0 && (
                        <>
                          <span className="mx-1.5 text-ink-mute/60">·</span>
                          <span className="font-semibold text-accent">
                            {p.errors.length}{" "}
                            {p.errors.length === 1 ? "error" : "errors"}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 px-4 py-3">
                    {p.message && (
                      <div>
                        <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-mute">
                          Message
                        </div>
                        <div className="whitespace-pre-wrap font-serif text-[13.5px] leading-[1.55] text-ink">
                          <Linkify text={p.message} />
                        </div>
                      </div>
                    )}

                    {p.recipients && p.recipients.length > 0 && (
                      <div>
                        <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-mute">
                          Sent to
                        </div>
                        <div className="text-[12.5px] leading-[1.55] text-ink-soft">
                          {p.recipients.join(" · ")}
                        </div>
                      </div>
                    )}

                    {(p.emailsSkipped ?? 0) + (p.smsSkipped ?? 0) > 0 && (
                      <div className="text-[11px] text-ink-mute">
                        Skipped:{" "}
                        {(p.emailsSkipped ?? 0) > 0 && (
                          <>
                            {p.emailsSkipped} without email
                          </>
                        )}
                        {(p.emailsSkipped ?? 0) > 0 &&
                          (p.smsSkipped ?? 0) > 0 && " · "}
                        {(p.smsSkipped ?? 0) > 0 && (
                          <>{p.smsSkipped} without SMS opt-in / phone</>
                        )}
                      </div>
                    )}

                    {p.errors && p.errors.length > 0 && (
                      <div>
                        <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-accent">
                          Delivery errors
                        </div>
                        <ul className="flex flex-col gap-1 text-[11.5px] text-accent">
                          {p.errors.map((err, i) => (
                            <li key={i}>
                              {err.name}
                              {err.channel && ` · ${err.channel}`} —{" "}
                              <span className="text-ink-mute">
                                {err.message}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
