import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function Home() {
  const session = await auth();
  if (session?.user) {
    const role = (session.user as { role?: string }).role;
    redirect(role === "MUSICIAN" ? "/my-gigs" : "/dashboard");
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-[1240px] items-center justify-between px-8 py-[18px]">
          <div className="font-serif text-[19px] font-medium tracking-tight">
            Gig<em className="font-light text-accent">wright</em>
          </div>
          <div className="font-serif text-[14px] font-light text-ink-soft">
            A quiet spine for working bandleaders
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1240px] px-8 pb-24 pt-20">
        {/* Hero */}
        <section className="flex flex-col items-center gap-8 text-center">
          <h1 className="font-serif text-[56px] font-light leading-[1.05] tracking-tight">
            One gig record. <br />
            <em className="text-accent">Every</em> calendar, text, and inbox in lockstep.
          </h1>
          <p className="max-w-[560px] text-[16px] leading-[1.55] text-ink-soft">
            Edit a gig once. Call times, personnel, set lists, and pay fan out to
            your musicians&rsquo; calendars, phones, and email &mdash; automatically.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/signin?callbackUrl=/welcome"
              className="inline-flex items-center gap-2 rounded-md bg-accent px-[20px] py-[12px] text-[14px] font-semibold text-paper transition-colors hover:bg-[#611B11]"
            >
              <span>Start free</span>
              <span className="font-serif text-[16px] font-light opacity-85">→</span>
            </Link>
            <Link
              href="/signin?callbackUrl=/welcome"
              className="inline-flex items-center gap-2 rounded-md border border-line-strong bg-transparent px-[20px] py-[12px] text-[14px] font-semibold text-ink hover:bg-paper-warm"
            >
              <span>Start 14-day Pro trial</span>
            </Link>
          </div>
          <p className="text-[12px] italic text-ink">
            No credit card needed to start.
          </p>
        </section>

        {/* Feature row */}
        <section className="mt-28 grid grid-cols-3 gap-10 border-t border-line pt-14">
          <Feature
            title="Tonight-ready dashboard"
            body="Every gig you've booked, sorted. Tonight's call time, downbeat, and band up front. No hunting through threads."
          />
          <Feature
            title="Excel-style payout worksheet"
            body="Per-gig income, band pay, and expenses. Live totals as you type. Date-paid tracking for every contractor. 1099 prep is a breeze."
          />
          <Feature
            title="Fanout on every edit"
            body="Move the call time — every musician's calendar event shifts, their phone buzzes with the diff, their inbox gets the updated gig sheet."
          />
          <Feature
            title="W-9s on file"
            body="Request a W-9 on first contact, auto-remind on every outgoing text until received. Year-end, you're already sorted for 1099-NECs."
          />
          <Feature
            title="Your rolodex, migrated"
            body="Import straight from Where's The Gig in one click. Venues, band members, history — all of it, in your hands."
          />
          <Feature
            title="Finance that pays for itself"
            body="YTD P&amp;L per gig, GSA per-diem, IRS mileage, M&amp;E, 1099-NEC references. Clean books by default. QuickBooks sync incoming."
          />
        </section>

        {/* Pricing */}
        <section className="mt-28 border-t border-line pt-14">
          <div className="mb-10 text-center">
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-mute">
              Simple pricing
            </div>
            <h2 className="mt-3 font-serif text-[40px] font-light leading-tight tracking-tight">
              Pay for it like you&rsquo;d pay a good sideman.
            </h2>
          </div>

          <div className="mx-auto grid max-w-[920px] grid-cols-2 gap-5">
            <PlanCard
              name="Free"
              price="$0"
              priceSub="forever"
              cta="Start free"
              href="/signin?callbackUrl=/welcome"
              bullets={[
                "Up to 10 musicians",
                "Up to 5 venues",
                "Up to 5 active gigs",
                "Full payout worksheet per gig",
                "Magic-link sign-in",
              ]}
            />
            <PlanCard
              name="Pro"
              price="$29"
              priceSub="/month"
              cta="Start 14-day free trial"
              href="/signin?callbackUrl=/welcome"
              highlight
              badge="14-day trial · no card"
              bullets={[
                "Unlimited everything",
                "SMS + email gig alerts",
                "iCloud + Google calendar sync",
                "Set list PDF upload + auto-notify",
                "W-9 reminders, 1099 export",
                "QuickBooks sync",
                "PDF gig sheets on demand",
              ]}
            />
          </div>
        </section>
      </main>

      <footer className="border-t border-line py-8">
        <div className="mx-auto max-w-[1240px] px-8 text-center text-[11px] uppercase tracking-[0.14em] text-ink-mute">
          Gigwright &middot; for working bandleaders
        </div>
      </footer>
    </div>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h3 className="font-serif text-[20px] font-normal tracking-tight">
        {title}
      </h3>
      <p className="mt-2 text-[14px] leading-[1.55] text-ink-soft">{body}</p>
    </div>
  );
}

function PlanCard({
  name,
  price,
  priceSub,
  cta,
  href,
  bullets,
  highlight,
  badge,
}: {
  name: string;
  price: string;
  priceSub: string;
  cta: string;
  href: string;
  bullets: string[];
  highlight?: boolean;
  badge?: string;
}) {
  return (
    <div
      className={`rounded-[12px] border p-7 ${
        highlight
          ? "border-accent bg-accent/5 shadow-[0_20px_60px_-30px_rgba(126,36,24,0.3)]"
          : "border-line bg-surface"
      }`}
    >
      <div className="flex items-baseline justify-between">
        <div className="font-serif text-[26px] font-normal">{name}</div>
        {badge && (
          <span className="rounded-full border border-accent bg-accent px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-paper">
            {badge}
          </span>
        )}
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="font-serif text-[48px] font-light tabular-nums">
          {price}
        </span>
        <span className="text-[14px] text-ink-mute">{priceSub}</span>
      </div>
      <ul className="mt-6 space-y-2 text-[14px] leading-[1.5] text-ink-soft">
        {bullets.map((b) => (
          <li key={b} className="flex gap-2">
            <span className="text-accent">·</span> <span>{b}</span>
          </li>
        ))}
      </ul>
      <Link
        href={href}
        className={`mt-7 block rounded-md px-5 py-3 text-center text-[14px] font-semibold transition-colors ${
          highlight
            ? "bg-accent text-paper hover:bg-[#611B11]"
            : "border border-line-strong bg-transparent text-ink hover:bg-paper-warm"
        }`}
      >
        {cta}
      </Link>
    </div>
  );
}
