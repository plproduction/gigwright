import { formatLongDate, formatTime } from "@/lib/format";

// The most-recent "Send update" the bandleader fired for this gig,
// rendered at the top of every sheet surface (public /g/[id], musician
// /my-gigs/[id], print sheet at /g/[id]/print). The headline (label) is
// what the bandleader typed into the "What changed?" box; the message
// is the free-form body. Either can be null — show whichever exists.
//
// When neither exists, the component renders nothing so older gigs
// (pre-feature) and brand-new gigs (never fanned out) don't show an
// empty box. We treat the existence of EITHER field plus a non-null
// lastUpdateAt as "an update was sent at some point."
export function LatestUpdateBanner({
  label,
  message,
  at,
}: {
  label: string | null;
  message: string | null;
  at: Date | string | null;
}) {
  if (!at || (!label && !message)) return null;
  const sentAt = typeof at === "string" ? new Date(at) : at;

  return (
    <div
      className="mb-5 rounded-md border border-accent/30 bg-accent/5 px-4 py-3"
      role="status"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
          Latest update
        </div>
        <div className="text-[10.5px] text-ink-mute">
          {formatLongDate(sentAt)} · {formatTime(sentAt)}
        </div>
      </div>
      {label && (
        <div className="mt-1.5 font-serif text-[18px] leading-tight tracking-tight text-ink">
          {label}
        </div>
      )}
      {message && (
        <div className="mt-1.5 whitespace-pre-wrap text-[13.5px] leading-[1.55] text-ink-soft">
          {message}
        </div>
      )}
    </div>
  );
}
