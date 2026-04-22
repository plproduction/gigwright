import Link from "next/link";
import { requireUser } from "@/lib/session";
import { TRIAL_DAYS } from "@/lib/stripe";

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const user = await requireUser();
  const { checkout } = await searchParams;

  const plan = user.plan;
  const isAdmin = plan === "ADMIN";
  const isPro = plan === "PRO";
  const periodEnd = user.currentPeriodEnd;

  return (
    <>
      <div className="mb-6 flex items-baseline justify-between border-b border-line pb-3">
        <h4 className="font-serif text-[22px] font-normal tracking-tight">
          Billing
        </h4>
        <Link
          href="/settings"
          className="text-[11px] text-ink-mute underline decoration-line-strong underline-offset-4 hover:text-ink"
        >
          ← Settings
        </Link>
      </div>

      {checkout === "success" && (
        <div className="mb-6 rounded-[10px] border border-success/30 bg-success/10 px-5 py-4">
          <div className="font-serif text-[16px] text-success">
            You&rsquo;re in.
          </div>
          <div className="mt-1 text-[13px] text-ink-soft">
            Pro unlocked. Your {TRIAL_DAYS}-day free trial has started — no
            charge until it ends.
          </div>
        </div>
      )}
      {checkout === "cancelled" && (
        <div className="mb-6 rounded-[10px] border border-line bg-paper-warm px-5 py-4 text-[13px] text-ink-soft">
          Checkout cancelled. No card was charged.
        </div>
      )}

      {/* Current plan */}
      <div className="mb-8 rounded-[10px] border border-line bg-paper p-5">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-mute">
          Current plan
        </div>
        <div className="flex items-baseline justify-between">
          <div>
            <div className="font-serif text-[28px] font-light tracking-tight">
              {isAdmin ? "Admin" : isPro ? "Pro" : "Free"}
            </div>
            <div className="mt-1 text-[13px] text-ink-soft">
              {isAdmin &&
                "Everything unlocked. You own the house."}
              {isPro && periodEnd && (
                <>Renews {periodEnd.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</>
              )}
              {!isAdmin && !isPro && (
                <>
                  Up to 10 musicians, 5 venues, 5 active gigs. No SMS alerts,
                  no QuickBooks sync.
                </>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            {!isAdmin && !isPro && (
              <form action="/api/billing/checkout" method="POST">
                <button
                  type="submit"
                  className="rounded-md bg-accent px-5 py-2.5 text-[13px] font-semibold text-paper hover:bg-[#611B11]"
                >
                  Start {TRIAL_DAYS}-day Pro trial
                </button>
              </form>
            )}
            {isPro && (
              <form action="/api/billing/portal" method="POST">
                <button
                  type="submit"
                  className="rounded-md border border-line-strong bg-transparent px-4 py-2 text-[13px] font-medium text-ink hover:bg-paper-warm"
                >
                  Manage subscription
                </button>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* Pricing cards */}
      {!isAdmin && (
        <div className="grid grid-cols-2 gap-4">
          <PlanCard
            name="Free"
            price="$0"
            active={!isPro}
            bullets={[
              "Up to 10 musicians",
              "Up to 5 venues",
              "Up to 5 active gigs",
              "Payout worksheet per gig",
              "Magic-link sign-in",
            ]}
          />
          <PlanCard
            name="Pro"
            price="$29"
            priceSub="/month"
            active={isPro}
            highlight={!isPro}
            bullets={[
              "Unlimited everything",
              "SMS + email gig alerts",
              "iCloud/Google calendar sync",
              "Set list PDF upload + auto-notify",
              "W-9 reminders, 1099 export",
              "QuickBooks sync",
              "PDF gig sheets",
            ]}
            trialLine={`${TRIAL_DAYS}-day free trial. No credit card needed to start.`}
          />
        </div>
      )}
    </>
  );
}

function PlanCard({
  name,
  price,
  priceSub,
  bullets,
  active,
  highlight,
  trialLine,
}: {
  name: string;
  price: string;
  priceSub?: string;
  bullets: string[];
  active?: boolean;
  highlight?: boolean;
  trialLine?: string;
}) {
  return (
    <div
      className={`rounded-[10px] border p-5 ${
        highlight
          ? "border-accent bg-accent/5"
          : active
            ? "border-ink bg-surface"
            : "border-line bg-surface"
      }`}
    >
      <div className="flex items-baseline justify-between">
        <div className="font-serif text-[22px] font-normal tracking-tight">
          {name}
        </div>
        {active && (
          <span className="rounded-full border border-ink bg-ink px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-paper">
            Current
          </span>
        )}
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="font-serif text-[36px] font-light tabular-nums">
          {price}
        </span>
        {priceSub && (
          <span className="text-[13px] text-ink-mute">{priceSub}</span>
        )}
      </div>
      <ul className="mt-4 space-y-1.5 text-[13px] text-ink-soft">
        {bullets.map((b) => (
          <li key={b} className="flex gap-2">
            <span className="text-accent">·</span> <span>{b}</span>
          </li>
        ))}
      </ul>
      {trialLine && (
        <div className="mt-4 border-t border-line pt-3 text-[11px] italic text-ink">
          {trialLine}
        </div>
      )}
    </div>
  );
}
