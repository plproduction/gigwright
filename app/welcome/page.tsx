import { auth } from "@/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { TRIAL_DAYS } from "@/lib/stripe";
import Link from "next/link";

// First-run landing after magic-link sign-in for brand-new users.
// Pick Free and continue, or Start Pro Trial and go to Stripe Checkout.
export default async function WelcomePage() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) redirect("/signin");

  const user = await db.user.findUnique({ where: { email } });
  if (!user) redirect("/signin");

  // If they already have a plan assigned (not FREE by default on a fresh
  // account), skip welcome and drop into the app.
  if (user.plan === "PRO" || user.plan === "ADMIN") {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-paper">
      <div className="mx-auto max-w-[920px] px-8 py-16">
        <header className="mb-10 text-center">
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

        <div className="grid grid-cols-2 gap-5">
          {/* Free */}
          <div className="rounded-[10px] border border-line bg-surface p-6">
            <div className="font-serif text-[24px]">Free</div>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="font-serif text-[40px] font-light tabular-nums">
                $0
              </span>
            </div>
            <ul className="mt-5 space-y-1.5 text-[13px] text-ink-soft">
              <li className="flex gap-2"><span className="text-accent">·</span> Up to 10 musicians</li>
              <li className="flex gap-2"><span className="text-accent">·</span> Up to 5 venues</li>
              <li className="flex gap-2"><span className="text-accent">·</span> Up to 5 active gigs</li>
              <li className="flex gap-2"><span className="text-accent">·</span> Payout worksheet per gig</li>
            </ul>
            <Link
              href="/dashboard"
              className="mt-6 block rounded-md border border-line-strong bg-transparent px-4 py-2.5 text-center text-[13px] font-semibold text-ink hover:bg-paper-warm"
            >
              Start free
            </Link>
          </div>

          {/* Pro */}
          <div className="rounded-[10px] border border-accent bg-accent/5 p-6">
            <div className="flex items-baseline justify-between">
              <div className="font-serif text-[24px]">Pro</div>
              <span className="rounded-full border border-accent bg-accent px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-paper">
                {TRIAL_DAYS}-day free trial
              </span>
            </div>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="font-serif text-[40px] font-light tabular-nums">
                $29
              </span>
              <span className="text-[13px] text-ink-mute">/month</span>
            </div>
            <ul className="mt-5 space-y-1.5 text-[13px] text-ink-soft">
              <li className="flex gap-2"><span className="text-accent">·</span> Unlimited everything</li>
              <li className="flex gap-2"><span className="text-accent">·</span> SMS + email gig alerts</li>
              <li className="flex gap-2"><span className="text-accent">·</span> iCloud + Google calendar sync</li>
              <li className="flex gap-2"><span className="text-accent">·</span> Set list PDF + auto-notify</li>
              <li className="flex gap-2"><span className="text-accent">·</span> W-9 reminders, 1099 export</li>
              <li className="flex gap-2"><span className="text-accent">·</span> QuickBooks sync</li>
            </ul>
            <form action="/api/billing/checkout" method="POST" className="mt-6">
              <button
                type="submit"
                className="w-full rounded-md bg-accent px-4 py-2.5 text-[13px] font-semibold text-paper hover:bg-[#611B11]"
              >
                Start {TRIAL_DAYS}-day Pro trial
              </button>
            </form>
            <p className="mt-3 text-[11px] italic leading-[1.4] text-ink">
              No charge until day {TRIAL_DAYS + 1}. Cancel anytime.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
