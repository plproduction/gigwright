import { auth } from "@/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { TRIAL_DAYS } from "@/lib/stripe";
import Link from "next/link";

// First-run landing after magic-link sign-in for brand-new users.
// Offers Free (continue to app) or Pro with a monthly/yearly choice.
// Pro → /api/billing/checkout?plan=month|year → Stripe Checkout with
// a 14-day trial, no charge today.
export default async function WelcomePage() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) redirect("/signin");

  const user = await db.user.findUnique({ where: { email } });
  if (!user) redirect("/signin");

  // If they already have a paid plan, skip welcome.
  if (user.plan === "PRO" || user.plan === "ADMIN") {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-paper">
      <div className="mx-auto max-w-[1080px] px-8 py-16">
        <header className="mb-12 text-center">
          <div className="font-serif text-[22px] font-medium tracking-tight">
            Gig<em className="font-light text-accent">wright</em>
          </div>
          <h1 className="mt-8 font-serif text-[44px] font-light leading-[1.05] tracking-tight">
            Welcome, <em className="text-accent">{user.name ?? email.split("@")[0]}</em>.
          </h1>
          <p className="mx-auto mt-4 max-w-[520px] text-[15px] leading-[1.55] text-ink-soft">
            Pick a plan to get started. You can change anytime.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-[1fr_1.2fr]">
          {/* Free */}
          <div className="rounded-[12px] border border-line bg-surface p-8">
            <div className="font-serif text-[24px]">Free</div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="font-serif text-[48px] font-light tabular-nums leading-none">
                $0
              </span>
              <span className="text-[13px] text-ink-mute">forever</span>
            </div>
            <p className="mt-4 text-[13px] text-ink-soft">
              Great for evaluating or running a single small group.
            </p>
            <ul className="mt-6 space-y-2 text-[13.5px] text-ink-soft">
              <li className="flex gap-2"><span className="text-accent">+</span> Up to 10 musicians</li>
              <li className="flex gap-2"><span className="text-accent">+</span> Up to 5 venues</li>
              <li className="flex gap-2"><span className="text-accent">+</span> Up to 5 active gigs</li>
              <li className="flex gap-2"><span className="text-accent">+</span> Payout worksheet per gig</li>
            </ul>
            <Link
              href="/dashboard"
              className="mt-7 block rounded-md border border-line-strong bg-transparent px-4 py-3 text-center text-[13px] font-semibold text-ink hover:bg-paper-warm"
            >
              Start free
            </Link>
          </div>

          {/* Pro — featured */}
          <div className="relative rounded-[12px] border border-accent bg-ink p-8 text-paper">
            <span className="absolute right-5 top-5 rounded bg-accent px-2.5 py-1 text-[9px] font-medium uppercase tracking-[0.2em] text-paper">
              {TRIAL_DAYS}-day free trial
            </span>
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
                  Start trial · Monthly
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
                  Start trial · Yearly
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
              No charge until day {TRIAL_DAYS + 1}. Cancel anytime before the trial ends and you won&rsquo;t be billed.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
