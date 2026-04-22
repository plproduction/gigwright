import Link from "next/link";

// Public About page. Doubles as a trust signal for Google Safe Browsing
// reviewers + real humans: who built it, why, and what the business does.
export const metadata = {
  title: "About",
  description:
    "GigWright is booking management software for working bandleaders, built by Patrick Lamb — a saxophonist and bandleader in Palm Beach, Florida.",
};

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-[1240px] items-center justify-between px-8 py-4">
          <Link href="/" className="font-serif text-[22px] font-medium tracking-tight">
            Gig<em className="font-light text-accent">Wright</em>
          </Link>
          <Link
            href="/"
            className="text-[13px] font-medium text-ink-soft transition-colors hover:text-ink"
          >
            &larr; Back to home
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[760px] px-8 py-20">
        <div className="mb-3 text-[11px] font-medium uppercase tracking-[0.22em] text-ink-mute">
          About
        </div>
        <h1 className="mb-6 font-serif text-[44px] font-light leading-tight tracking-tight">
          Built by a working bandleader.
        </h1>

        <div className="space-y-5 text-[16px] leading-[1.7] text-ink-soft">
          <p>
            GigWright is booking management software for working bandleaders. It&rsquo;s operated by Patrick Lamb Productions, a music production company based in Palm Beach, Florida.
          </p>
          <p>
            Patrick Lamb is a saxophonist, bandleader, and producer who plays 200+ events a year. GigWright was built because every existing tool failed at the one thing that matters most: keeping the band in sync when something changes at 3pm on a gig day.
          </p>
          <p>
            We use GigWright at every real gig. Whatever friction we hit shows up on the fix list that same week. That&rsquo;s why the app feels like it was designed around a gig day instead of a trade show pitch.
          </p>
        </div>

        <h2 className="mt-14 mb-4 font-serif text-[26px] font-normal tracking-tight">
          What it does
        </h2>
        <ul className="space-y-2.5 text-[15px] leading-[1.6] text-ink-soft">
          <li className="flex gap-3"><span className="text-accent">+</span>A single home for every gig you book — call times, venue, personnel, pay, set list, notes.</li>
          <li className="flex gap-3"><span className="text-accent">+</span>Two-way calendar sync (iCloud, Google, Outlook) so every musician sees changes on the calendar they already use.</li>
          <li className="flex gap-3"><span className="text-accent">+</span>Diff-aware SMS and email — when something changes, the band gets a message that says exactly what changed.</li>
          <li className="flex gap-3"><span className="text-accent">+</span>A per-gig payout worksheet, a permission wall so musicians only see their own pay, and tax-ready expense tagging for Schedule C / 1099-NEC.</li>
          <li className="flex gap-3"><span className="text-accent">+</span>QuickBooks Online push so payouts become bills in your books automatically.</li>
        </ul>

        <h2 className="mt-14 mb-4 font-serif text-[26px] font-normal tracking-tight">
          How to reach us
        </h2>
        <div className="space-y-3 text-[15px] leading-[1.7] text-ink-soft">
          <p>
            <strong className="text-ink">General / support:</strong>{" "}
            <a href="mailto:hello@gigwright.com" className="text-accent underline-offset-4 hover:underline">
              hello@gigwright.com
            </a>
          </p>
          <p>
            <strong className="text-ink">Patrick directly:</strong>{" "}
            <a href="mailto:patrick@patricklamb.com" className="text-accent underline-offset-4 hover:underline">
              patrick@patricklamb.com
            </a>
          </p>
          <p>
            <strong className="text-ink">Based in:</strong> Palm Beach, Florida, USA
          </p>
        </div>

        <div className="mt-14 border-t border-line pt-8 text-center">
          <Link
            href="/signin?callbackUrl=/welcome"
            className="inline-flex items-center gap-2 rounded-md bg-accent px-6 py-3 text-[14px] font-semibold text-paper transition-colors hover:bg-[#611B11]"
          >
            <span>Start a 14-day free trial</span>
            <span className="font-serif text-[16px] font-light opacity-85">→</span>
          </Link>
          <p className="mt-3 text-[12px] text-ink-mute">
            No credit card required.
          </p>
        </div>
      </main>

      <footer className="border-t border-line bg-paper-warm py-10">
        <div className="mx-auto max-w-[1240px] px-8 text-center text-[12px] text-ink-mute">
          © 2026 GigWright ·{" "}
          <Link href="/privacy" className="hover:text-ink">Privacy</Link>{" "}·{" "}
          <Link href="/terms" className="hover:text-ink">Terms</Link>{" "}·{" "}
          <Link href="/about" className="hover:text-ink">About</Link>
        </div>
      </footer>
    </div>
  );
}
