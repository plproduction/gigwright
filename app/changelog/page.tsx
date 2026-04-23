import Link from "next/link";

// Public changelog. Works as a trust signal (real active site),
// product-marketing surface ("look what we shipped this week"), and
// search/indexable content for SEO.
export const metadata = {
  title: "Changelog",
  description:
    "What's new in GigWright — product updates from the workbench.",
};

type Entry = {
  date: string; // human-readable
  tag?: "new" | "improvement" | "fix";
  title: string;
  body: string;
};

const ENTRIES: Entry[] = [
  {
    date: "April 22, 2026",
    tag: "new",
    title: "Tax-tagged expense rows + year-end CSV exports",
    body: "Quick-add buttons for Mileage (IRS $0.70/mi), Per-diem (GSA $68/day M&IE), Meals & entertainment, Lodging, and Travel on every payout worksheet. Finance tab now has a proper year-end view with expenses grouped by tax kind and two CSV downloads ready for Schedule C and 1099-NEC prep.",
  },
  {
    date: "April 22, 2026",
    tag: "new",
    title: "Public /g/:id gig sheets",
    body: "Every gig has a read-only public URL you can drop in a text or DM. Musicians see times, venue with map link, band first names, loading info (notes + map image + alternate link), tech & attire, and set list PDF. Never pay, expenses, or reconciliation — hard wall.",
  },
  {
    date: "April 22, 2026",
    tag: "new",
    title: "Clone gig + Mark all paid + Request W-9",
    body: "Three bandleader wins. Clone gig duplicates a gig as a fresh INQUIRY one week out with the same venue and band. Mark all paid bulk-marks every unpaid musician paid today via a chosen method. Request W-9 emails a musician an IRS form link with one click — and stamps the request date so you don't double-send.",
  },
  {
    date: "April 22, 2026",
    tag: "new",
    title: "Loading info section on every gig page",
    body: "Notes (\"alley entrance, knock on service door\"), an uploadable map image, and an alternate external map link — for the musician who's trying to load a keyboard through a service door at 4pm.",
  },
  {
    date: "April 22, 2026",
    tag: "improvement",
    title: "Monthly / yearly pricing picker on /welcome",
    body: "After magic-link signin, new users pick between $20/month and $200/year (save $40). Both route to Stripe Checkout with a 14-day trial; webhook flips the plan to PRO once they complete checkout.",
  },
  {
    date: "April 22, 2026",
    tag: "improvement",
    title: "Rebuilt landing page + new brand: GigWright",
    body: "New hero: \"A playwright writes plays. A GigWright runs gigs.\" Subtitle: the bandleader's workbench — from the first call to the final payout. Full Cowork-style landing: 9-feature grid, sync-spine marquee, comparison table, 8-question FAQ, real pricing card.",
  },
  {
    date: "April 22, 2026",
    tag: "new",
    title: "Live domain + legal pages",
    body: "gigwright.com (apex and www) live on Vercel behind Let's Encrypt TLS. /privacy and /terms shipped with full disclosure of the SMS, permission wall, and third-party integration story. /about page describes who we are and how to reach us.",
  },
  {
    date: "April 22, 2026",
    tag: "new",
    title: "First-run onboarding dashboard",
    body: "Brand-new accounts with zero gigs get a welcoming 4-step block (roster → venue → first gig → QuickBooks) instead of empty stat tiles. Includes a concierge migration CTA for bandleaders moving from Where's The Gig or anything else.",
  },
];

const TAG_STYLES: Record<NonNullable<Entry["tag"]>, string> = {
  new: "bg-accent text-paper",
  improvement: "bg-ink text-paper",
  fix: "bg-paper-deep text-ink-soft",
};

export default function ChangelogPage() {
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
          Changelog
        </div>
        <h1 className="mb-4 font-serif text-[44px] font-light leading-tight tracking-tight">
          What&rsquo;s new.
        </h1>
        <p className="mb-14 max-w-[620px] text-[15px] leading-[1.6] text-ink-soft">
          GigWright is built at the gig. Whatever friction we hit on a Saturday
          night becomes a commit on Sunday morning. Here&rsquo;s the running log.
        </p>

        <div className="space-y-10">
          {ENTRIES.map((e, i) => (
            <article key={i} className="border-l-2 border-line pl-6">
              <div className="mb-1 flex items-center gap-3">
                {e.tag && (
                  <span
                    className={`rounded px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] ${TAG_STYLES[e.tag]}`}
                  >
                    {e.tag}
                  </span>
                )}
                <span className="text-[11px] text-ink-mute">{e.date}</span>
              </div>
              <h2 className="mb-2 font-serif text-[22px] font-normal leading-tight tracking-tight">
                {e.title}
              </h2>
              <p className="text-[14.5px] leading-[1.6] text-ink-soft">{e.body}</p>
            </article>
          ))}
        </div>

        <div className="mt-16 border-t border-line pt-10 text-center">
          <Link
            href="/signin?callbackUrl=/welcome"
            className="inline-flex items-center gap-2 rounded-md bg-accent px-6 py-3 text-[14px] font-semibold text-paper transition-colors hover:bg-[#611B11]"
          >
            <span>Start a 14-day free trial</span>
            <span className="font-serif text-[16px] font-light opacity-85">→</span>
          </Link>
        </div>
      </main>

      <footer className="border-t border-line bg-paper-warm py-10">
        <div className="mx-auto max-w-[1240px] px-8 text-center text-[12px] text-ink-mute">
          © 2026 GigWright ·{" "}
          <Link href="/privacy" className="hover:text-ink">Privacy</Link>{" "}·{" "}
          <Link href="/terms" className="hover:text-ink">Terms</Link>{" "}·{" "}
          <Link href="/about" className="hover:text-ink">About</Link>{" "}·{" "}
          <Link href="/changelog" className="hover:text-ink">Changelog</Link>
        </div>
      </footer>
    </div>
  );
}
