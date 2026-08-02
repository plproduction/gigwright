import { auth } from "@/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { TRIAL_DAYS } from "@/lib/stripe";

// Paywall shown once a bandleader's 14-day trial has lapsed. There is no
// free tier, so this is a dead end until they subscribe: requireBandleader()
// redirects every leader surface here while plan is FREE. Anyone still
// inside their trial carries plan="PRO" and is bounced to /dashboard below,
// so in practice only lapsed accounts ever render this page.
export default async function WelcomePage() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) redirect("/signin");

  const user = await db.user.findUnique({ where: { email } });
  if (!user) redirect("/signin");

  // Paid or still trialing (trial carries plan="PRO") — nothing to sell.
  if (user.plan === "PRO" || user.plan === "ADMIN") {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-paper">
      <div className="mx-auto max-w-[1080px] px-8 py-16">
        <header className="mb-12 text-center">
          <div className="font-serif text-[22px] font-medium tracking-tight">
            Gig<em className="font-light text-accent">Wright</em>
          </div>
          <h1 className="mt-8 font-serif text-[44px] font-light leading-[1.05] tracking-tight">
            Your trial has ended, <em className="text-accent">{user.name ?? email.split("@")[0]}</em>.
          </h1>
          <p className="mx-auto mt-4 max-w-[520px] text-[15px] leading-[1.55] text-ink-soft">
            Your {TRIAL_DAYS} free days are up. Everything you&rsquo;ve built is
            still here — your gigs, roster, and venues are untouched, and your
            musicians keep their portal for free. Subscribe to pick up where
            you left off.
          </p>
        </header>

        <div className="mx-auto grid max-w-[620px] grid-cols-1 gap-5">
          {/* Pro — the only plan. There is no free tier: every account gets
              one 14-day trial at signup, and after that it's paid. */}
          <div className="relative rounded-[12px] border border-accent bg-ink p-8 text-paper">
            <div className="font-serif text-[24px]">Pro</div>
            <p className="mt-2 text-[13px] text-paper/65">
              For the working pro running their own gigs.
            </p>

            {/* Pricing toggle — two forms side by side, submit to checkout with plan */}
            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <form action="/api/billing/checkout" method="POST" className="flex flex-col">
                <input type="hidden" name="plan" value="month" />
                <div className="mb-4 rounded-[10px] border border-paper/15 bg-paper/5 p-4">
                  <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-paper/55">Monthly</div>
                  <div className="mt-1 flex items-baseline gap-1">
                    <span className="font-serif text-[38px] font-light leading-none tabular-nums">$20</span>
                    <span className="text-[13px] text-paper/55">/mo</span>
                  </div>
                  <div className="mt-2 text-[11px] text-paper/55">Cancel anytime</div>
                </div>
                <button
                  type="submit"
                  className="mt-auto w-full rounded-md border border-paper/20 bg-transparent px-4 py-3 text-[13px] font-semibold text-paper hover:bg-paper/10"
                >
                  Subscribe · Monthly
                </button>
              </form>
              <form action="/api/billing/checkout" method="POST" className="flex flex-col">
                <input type="hidden" name="plan" value="year" />
                <div className="relative mb-4 rounded-[10px] border border-accent bg-accent/15 p-4">
                  <span className="absolute right-3 top-3 rounded bg-accent px-1.5 py-0.5 text-[8px] font-medium uppercase tracking-[0.18em] text-paper">
                    Save $40
                  </span>
                  <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-accent-soft">Yearly</div>
                  <div className="mt-1 flex items-baseline gap-1">
                    <span className="font-serif text-[38px] font-light leading-none tabular-nums">$200</span>
                    <span className="text-[13px] text-paper/55">/yr</span>
                  </div>
                  <div className="mt-2 text-[11px] text-paper/55">Equivalent to $16.67/mo</div>
                </div>
                <button
                  type="submit"
                  className="mt-auto w-full rounded-md bg-accent px-4 py-3 text-[13px] font-semibold text-paper hover:bg-[#611B11]"
                >
                  Subscribe · Yearly
                </button>
              </form>
            </div>

            <ul className="mt-7 space-y-2 text-[13.5px] text-paper/85">
              <li className="flex gap-2"><span className="text-accent-soft">+</span> Unlimited gigs, musicians, venues</li>
              <li className="flex gap-2"><span className="text-accent-soft">+</span> Two-way iCloud, Google, Outlook calendar sync</li>
              <li className="flex gap-2"><span className="text-accent-soft">+</span> Diff-aware SMS + email fanout</li>
              <li className="flex gap-2"><span className="text-accent-soft">+</span> Per-gig payout worksheet</li>
              <li className="flex gap-2"><span className="text-accent-soft">+</span> QuickBooks Online push</li>
              <li className="flex gap-2"><span className="text-accent-soft">+</span> Set list PDFs + auto-notify</li>
              <li className="flex gap-2"><span className="text-accent-soft">+</span> Musician portal — free for your band</li>
            </ul>

            <p className="mt-6 text-[11px] text-paper/55">
              Billing starts today — your {TRIAL_DAYS} free days are already used. Cancel anytime from Settings &rarr; Billing.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
