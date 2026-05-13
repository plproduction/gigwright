import Link from "next/link";

// Inline "Upgrade to Pro" affordance shown when a FREE user is at
// (or near) a plan cap, or when they land on a Pro-only surface. The
// visual vocabulary matches the rest of the page — warm paper bg,
// hairline border, accent-burgundy CTA — so it doesn't read as an
// upsell pop-up. It's intended as a quiet, useful nudge, not a
// dark-pattern.
export function UpgradeBanner({
  message,
  cta = "Upgrade to Pro",
  reason,
}: {
  message: string;
  cta?: string;
  // Optional query param appended to /settings/billing so that page
  // can render a contextual headline ("Upgrade to enable QuickBooks
  // sync", etc.).
  reason?: string;
}) {
  const href = reason
    ? `/settings/billing?upgrade=${encodeURIComponent(reason)}`
    : "/settings/billing";

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-accent/30 bg-accent/5 px-4 py-3">
      <div className="text-[13px] leading-[1.5] text-ink-soft">
        <span className="mr-2 rounded bg-accent px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-paper">
          Pro
        </span>
        {message}
      </div>
      <Link
        href={href}
        className="whitespace-nowrap rounded-md bg-accent px-3 py-1.5 text-[12px] font-semibold text-paper hover:bg-[#611B11]"
      >
        {cta} →
      </Link>
    </div>
  );
}
