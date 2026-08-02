import Link from "next/link";
import { requireUser } from "@/lib/session";
import { TRIAL_DAYS } from "@/lib/stripe";
import { FREE_LIMITS, PRO_ONLY_FEATURES } from "@/lib/plan";
import { resyncSubscriptionFromStripe } from "@/lib/actions/billing";

// Contextual headlines for the `?upgrade=X` query param. Matches the
// `reason` values used by UpgradeBanner and the QBO/setlist gates so
// the page reads like the rest of the journey rather than a generic
// pricing wall.
const UPGRADE_HEADLINES: Record<string, string> = {
  musicians: `You've hit the Free roster limit of ${FREE_LIMITS.musicians} musicians. Upgrade for unlimited.`,
  venues: `You've hit the Free venues limit of ${FREE_LIMITS.venues}. Upgrade for unlimited.`,
  activeGigs: `You've hit the Free active-gigs limit of ${FREE_LIMITS.activeGigs}. Upgrade for unlimited.`,
  qbo: `${PRO_ONLY_FEATURES.qbo} is a Pro feature. Upgrade to enable it.`,
  setlistUpload: `${PRO_ONLY_FEATURES.setlistUpload} are a Pro feature. Upgrade to enable.`,
  sms: `${PRO_ONLY_FEATURES.sms} are a Pro feature. Upgrade to enable.`,
  calendarSync: `${PRO_ONLY_FEATURES.calendarSync} is a Pro feature. Upgrade to enable.`,
};

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string; upgrade?: string }>;
}) {
  const user = await requireUser();
  const { checkout, upgrade } = await searchParams;

  const plan = user.plan;
  const isAdmin = plan === "ADMIN";
  const isPro = plan === "PRO";
  const periodEnd = user.currentPeriodEnd;

  const upgradeHeadline =
    upgrade && upgrade in UPGRADE_HEADLINES
      ? UPGRADE_HEADLINES[upgrade]
      : null;

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

      {upgradeHeadline && !isPro && !isAdmin && (
        <div className="mb-6 rounded-[10px] border border-accent/30 bg-accent/5 px-5 py-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">
            Why you&rsquo;re here
          </div>
          <div className="mt-1 font-serif text-[16px] text-ink">
            {upgradeHeadline}
          </div>
        </div>
      )}

      {/* Renewal-failure nudge. Driven by the invoice.payment_failed
          webhook; cleared on next successful invoice.paid. */}
      {user.paymentFailedAt && isPro && (
        <div className="mb-6 rounded-[10px] border border-accent bg-accent/10 px-5 py-4">
          <div className="font-serif text-[16px] text-accent">
            Your last payment didn&rsquo;t go through.
          </div>
          <div className="mt-1 text-[13px] text-ink-soft">
            Stripe will keep retrying for a few days. Update your card in the
            Customer Portal to avoid losing Pro.
          </div>
          <form action="/api/billing/portal" method="POST" className="mt-3">
            <button
              type="submit"
              className="rounded-md bg-accent px-4 py-2 text-[12.5px] font-semibold text-paper hover:bg-[#611B11]"
            >
              Update payment method
            </button>
          </form>
        </div>
      )}

      {/* Trial-ending nudge. Webhook fires ~3 days before the first
          charge. Cleared on first successful invoice.paid. */}
      {user.trialEndingAt && isPro && !user.paymentFailedAt && (
        <div className="mb-6 rounded-[10px] border border-line-strong bg-paper-warm px-5 py-4">
          <div className="font-serif text-[16px] text-ink">
            Your trial ends soon.
          </div>
          <div className="mt-1 text-[13px] text-ink-soft">
            Confirm your payment method in the Customer Portal so you don&rsquo;t
            lose Pro when the trial ends
            {periodEnd ? ` on ${periodEnd.toLocaleDateString("en-US", { month: "long", day: "numeric" })}` : ""}
            .
          </div>
          <form action="/api/billing/portal" method="POST" className="mt-3">
            <button
              type="submit"
              className="rounded-md border border-line-strong bg-transparent px-4 py-2 text-[12.5px] font-semibold text-ink hover:bg-paper"
            >
              Open Customer Portal
            </button>
          </form>
        </div>
      )}

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
      {checkout === "already-pro" && (
        <div className="mb-6 rounded-[10px] border border-line bg-paper-warm px-5 py-4 text-[13px] text-ink-soft">
          You&rsquo;re already on Pro. To change your plan or update payment,
          use the Manage subscription button below.
        </div>
      )}

      {/* Current plan */}
      <div className="mb-8 rounded-[10px] border border-line bg-paper p-5">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-mute">
          Current plan
        </div>
        <div className="flex items-baseline justify-between">
          <div>
            <div className="flex items-baseline gap-3">
              <div className="font-serif text-[28px] font-light tracking-tight">
                {isAdmin ? "Admin" : isPro ? "Pro" : "Free"}
              </div>
              {isPro && user.cancelAtPeriodEnd && (
                <span className="rounded-full border border-line-strong bg-paper-warm px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-mute">
                  Cancelled
                </span>
              )}
            </div>
            <div className="mt-1 text-[13px] text-ink-soft">
              {isAdmin &&
                "Everything unlocked. You own the house."}
              {isPro && user.cancelAtPeriodEnd && periodEnd && (
                <>
                  Pro until{" "}
                  {periodEnd.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                  . Renewal turned off &mdash; you won&rsquo;t be charged again.
                </>
              )}
              {isPro && !user.cancelAtPeriodEnd && periodEnd && (
                <>Renews {periodEnd.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</>
              )}
              {!isAdmin && !isPro && (
                <>
                  Up to {FREE_LIMITS.musicians} musicians, {FREE_LIMITS.venues} venues, {FREE_LIMITS.activeGigs} active gigs. No SMS alerts,
                  no QuickBooks sync.
                </>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!isAdmin && !isPro && (
              <>
                <form action="/api/billing/checkout" method="POST">
                  <input type="hidden" name="plan" value="month" />
                  <button
                    type="submit"
                    className="rounded-md border border-line-strong bg-transparent px-4 py-2.5 text-[13px] font-semibold text-ink hover:bg-paper-warm"
                  >
                    Start {TRIAL_DAYS}-day trial · $20/mo
                  </button>
                </form>
                <form action="/api/billing/checkout" method="POST">
                  <input type="hidden" name="plan" value="year" />
                  <button
                    type="submit"
                    className="rounded-md bg-accent px-5 py-2.5 text-[13px] font-semibold text-paper hover:bg-[#611B11]"
                  >
                    Start {TRIAL_DAYS}-day trial · $200/yr
                    <span className="ml-1.5 rounded bg-paper/15 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-[0.16em]">
                      Save $40
                    </span>
                  </button>
                </form>
              </>
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

        {/* Reconciliation: pull subscription state straight from Stripe.
            Surfaced only when there's a Stripe customer attached, so it
            doesn't appear on accounts that have never touched checkout.
            Useful if a webhook ever gets dropped and the local plan
            drifts from Stripe's authoritative state. */}
        {user.stripeCustomerId && (
          <form
            action={resyncSubscriptionFromStripe}
            className="mt-4 flex items-center justify-end border-t border-line pt-3"
          >
            <button
              type="submit"
              className="text-[11px] italic text-ink-mute underline decoration-line-strong underline-offset-4 hover:text-ink"
              title="Re-pull subscription state from Stripe in case a webhook was missed"
            >
              Resync from Stripe
            </button>
          </form>
        )}
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
            price="$20"
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
            trialLine={`${TRIAL_DAYS}-day free trial. Card on file, nothing charged until day ${TRIAL_DAYS + 1}.`}
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
