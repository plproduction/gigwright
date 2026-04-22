import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";

// Landing page — ported from the Cowork design onto GigWright's live design
// system. Sticky nav, hero with dashboard preview mock, credibility strip,
// problem/solution, 9 features, sync spine, comparison, pricing, FAQ, CTA,
// footer. Everything links back to /signin?callbackUrl=/welcome since that's
// the real auth flow.

const START = "/signin?callbackUrl=/welcome";

export default async function Home() {
  const session = await auth();
  if (session?.user) {
    const role = (session.user as { role?: string }).role;
    redirect(role === "MUSICIAN" ? "/my-gigs" : "/dashboard");
  }

  return (
    <div className="flex flex-1 flex-col bg-paper text-ink">
      <TopNav />
      <Hero />
      <Credibility />
      <Problem />
      <Features />
      <Spine />
      <Compare />
      <Pricing />
      <Faq />
      <CtaBand />
      <Footer />
    </div>
  );
}

/* ============================================================
   NAV
============================================================ */
function TopNav() {
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-paper/90 backdrop-blur-md backdrop-saturate-150">
      <div className="mx-auto flex max-w-[1240px] items-center justify-between px-8 py-4">
        <Link href="/" className="font-serif text-[22px] font-medium tracking-tight">
          Gig<em className="font-light text-accent">Wright</em>
        </Link>
        <nav className="hidden items-center gap-7 md:flex">
          <a href="#features" className="text-[13px] font-medium text-ink-soft transition-colors hover:text-ink">Features</a>
          <a href="#vs" className="text-[13px] font-medium text-ink-soft transition-colors hover:text-ink">How it compares</a>
          <a href="#pricing" className="text-[13px] font-medium text-ink-soft transition-colors hover:text-ink">Pricing</a>
          <a href="#faq" className="text-[13px] font-medium text-ink-soft transition-colors hover:text-ink">FAQ</a>
        </nav>
        <div className="flex items-center gap-2.5">
          <Link
            href="/signin"
            className="rounded-md border border-line-strong bg-transparent px-4 py-2.5 text-[13px] font-medium text-ink transition-colors hover:bg-paper-warm"
          >
            Sign in
          </Link>
          <Link
            href={START}
            className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2.5 text-[13px] font-medium text-paper transition-colors hover:bg-black"
          >
            <span>Start free trial</span>
            <span className="font-serif text-[16px] font-light opacity-85">→</span>
          </Link>
        </div>
      </div>
    </header>
  );
}

/* ============================================================
   HERO
============================================================ */
function Hero() {
  return (
    <section className="border-b border-line">
      <div className="mx-auto grid max-w-[1240px] grid-cols-1 items-center gap-16 px-8 pb-16 pt-22 lg:grid-cols-[1.1fr_0.9fr]">
        {/* Left column */}
        <div>
          <div className="mb-7 inline-flex items-center gap-2.5 rounded-full border border-line-strong bg-surface px-3 py-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-ink-mute">
              Now in private beta
            </span>
          </div>
          <h1 className="mb-6 font-serif text-[56px] font-light leading-[1.02] tracking-tight md:text-[64px]">
            A playwright writes plays. A <em className="text-accent">GigWright</em> runs gigs.
          </h1>
          <p className="mb-9 max-w-[540px] text-[17px] leading-[1.55] text-ink-soft md:text-[18px]">
            The bandleader&rsquo;s workbench &mdash; from the first call to the final payout.
          </p>
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <Link
              href={START}
              className="inline-flex items-center gap-2 rounded-md bg-ink px-6 py-3.5 text-[14px] font-semibold text-paper transition-colors hover:bg-black"
            >
              <span>Start 14-day free trial</span>
              <span className="font-serif text-[16px] font-light opacity-85">→</span>
            </Link>
            <a
              href="#features"
              className="inline-flex items-center gap-2 rounded-md border border-line-strong bg-transparent px-6 py-3.5 text-[14px] font-semibold text-ink transition-colors hover:bg-paper-warm"
            >
              See how it works
            </a>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] text-ink-mute">
            <span>No card required</span>
            <span className="text-line-strong">·</span>
            <span>Cancel anytime</span>
            <span className="text-line-strong">·</span>
            <span>Built for working pros</span>
          </div>
        </div>
        {/* Right column — dashboard preview */}
        <HeroMock />
      </div>
    </section>
  );
}

function HeroMock() {
  return (
    <div className="overflow-hidden rounded-[12px] border border-line bg-surface shadow-[0_30px_60px_-25px_rgba(14,12,9,0.18),0_8px_16px_-8px_rgba(14,12,9,0.08)]">
      <div className="flex items-center gap-2 border-b border-line bg-paper-warm px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
        <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
        <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
        <span className="ml-3 max-w-[280px] flex-1 truncate rounded border border-line bg-paper px-2.5 py-1 text-[11px] text-ink-mute">
          gigwright.com/app
        </span>
      </div>
      <div className="px-6 py-5">
        {/* Tonight card */}
        <div className="mb-4 rounded-[10px] bg-ink px-5 py-4 text-paper">
          <div className="mb-2 text-[9px] font-medium uppercase tracking-[0.22em] text-paper/55">
            Tonight
          </div>
          <div className="mb-1.5 font-serif text-[20px] font-light leading-tight">
            The Breakers · Mediterranean Ballroom
          </div>
          <div className="text-[12px] text-paper/70">
            Call 5:30 · Downbeat 7:00 · Black tie · 7-piece
          </div>
          <div className="mt-3 flex gap-5 border-t border-paper/10 pt-3">
            <div>
              <div className="text-[9px] font-medium uppercase tracking-[0.18em] text-paper/50">Client pays</div>
              <div className="mt-0.5 text-[13px] font-medium">$8,400</div>
            </div>
            <div>
              <div className="text-[9px] font-medium uppercase tracking-[0.18em] text-paper/50">Band total</div>
              <div className="mt-0.5 text-[13px] font-medium">$5,250</div>
            </div>
            <div>
              <div className="text-[9px] font-medium uppercase tracking-[0.18em] text-paper/50">Your net</div>
              <div className="mt-0.5 text-[13px] font-medium">$3,150</div>
            </div>
          </div>
        </div>
        {/* Upcoming rows */}
        <div className="flex flex-col gap-2.5">
          <MockRow date={{ d: "26", m: "Apr" }} title="Private wedding · Ocean Reef" sub="7-pc · Call 4:00 · Downbeat 6:00" pill="Confirmed" pay="$6,800" />
          <MockRow date={{ d: "02", m: "May" }} title="Mar-a-Lago Spring Gala" sub="9-pc · Call 5:30 · Downbeat 7:30" pill="Confirmed" pay="$11,200" />
          <MockRow date={{ d: "09", m: "May" }} title="Sailfish Club anniversary" sub="5-pc · Call 6:00 · Downbeat 8:00" pill="Hold" pay="$4,400" pillTone="warn" />
        </div>
      </div>
    </div>
  );
}

function MockRow({
  date,
  title,
  sub,
  pill,
  pay,
  pillTone = "accent",
}: {
  date: { d: string; m: string };
  title: string;
  sub: string;
  pill: string;
  pay: string;
  pillTone?: "accent" | "warn";
}) {
  return (
    <div className="grid grid-cols-[64px_1fr_auto_auto] items-center gap-3.5 rounded-lg border border-line bg-paper px-3.5 py-3">
      <div className="text-center">
        <div className="font-serif text-[22px] font-normal leading-none">{date.d}</div>
        <div className="mt-1 text-[9px] font-medium uppercase tracking-[0.18em] text-ink-mute">{date.m}</div>
      </div>
      <div>
        <div className="text-[13px] font-medium">{title}</div>
        <div className="mt-0.5 text-[11px] text-ink-mute">{sub}</div>
      </div>
      <span
        className={`rounded px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em] ${
          pillTone === "warn" ? "bg-warn/12 text-warn" : "bg-accent-soft text-accent"
        }`}
        style={pillTone === "warn" ? { backgroundColor: "rgba(139,105,20,0.12)" } : undefined}
      >
        {pill}
      </span>
      <div className="font-serif text-[15px]">{pay}</div>
    </div>
  );
}

/* ============================================================
   CREDIBILITY
============================================================ */
function Credibility() {
  return (
    <div className="border-b border-line bg-paper-warm">
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-8 px-8 py-9">
        <div className="whitespace-nowrap text-[11px] font-medium uppercase tracking-[0.2em] text-ink-mute">
          Built by
        </div>
        <div className="flex-1 text-center font-serif text-[16px] font-light leading-snug text-ink-soft md:text-[18px]">
          A working bandleader playing <em className="text-ink">200+ events a year</em> &mdash; designed around what working pros actually need at 3pm on a gig day.
        </div>
        <div className="whitespace-nowrap text-[11px] text-ink-mute">
          v1 · Private beta · Spring 2026
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   PROBLEM / SOLUTION
============================================================ */
function Problem() {
  const before = [
    "One-way calendar sync at best — your changes never propagate back from the musician's side.",
    "SMS support is either bolted-on or missing entirely. Group texts are not a notification system.",
    "Pay reconciliation lives in a spreadsheet you maintain by hand after every gig.",
    "UI built around booking the gig instead of running the gig you already booked.",
    "Five-figure annual revenue running through software that looks like it was last updated in 2003.",
  ];
  const after = [
    "Two-way sync with iCloud, Google, and Outlook — every musician picks their own provider, you don't manage anything.",
    "SMS that calls out exactly what changed. \u201CDownbeat now 8:00, was 7:30.\u201D Not the whole message re-blasted.",
    "Pay reconciliation built in: client pays, band total, your net, per-musician pay, paid-status, payment method.",
    "Per-musician permission wall — they see only what's theirs. Never the roster, never the reconciliation.",
    "Designed like a tool you'd actually be proud to open in front of a client.",
  ];
  return (
    <SectionBay id="problem" num="01" label="The state of things"
      heading={<>Booking management software <em className="text-accent">stopped evolving</em> twenty years ago.</>}
      lede="The tools out there work, technically. But every one of them solves a different problem than the one you actually have at 3pm when a client moves the call time and you need every musician on the gig to know right now."
    >
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <ProblemCard tone="before" label="What you're using now"
          title="Email blasts, group texts, and a Squarespace calendar that nobody checks."
          items={before} mark="—"
        />
        <ProblemCard tone="after" label="What GigWright gives you"
          title="One gig record. Three channels. Always in lockstep, always diff-aware."
          items={after} mark="+"
        />
      </div>
    </SectionBay>
  );
}

function ProblemCard({
  tone,
  label,
  title,
  items,
  mark,
}: {
  tone: "before" | "after";
  label: string;
  title: string;
  items: string[];
  mark: string;
}) {
  return (
    <div className={`rounded-[10px] border border-line p-8 ${tone === "before" ? "bg-paper-warm" : "bg-surface"}`}>
      <div className={`mb-4 text-[10px] font-medium uppercase tracking-[0.22em] ${tone === "after" ? "text-accent" : "text-ink-mute"}`}>
        {label}
      </div>
      <h3 className="mb-5 font-serif text-[24px] font-normal leading-tight tracking-tight">{title}</h3>
      <ul className="list-none">
        {items.map((t, i) => (
          <li key={i} className={`flex items-start gap-3 py-2.5 text-[14px] leading-[1.55] text-ink-soft ${i > 0 ? "border-t border-line" : ""}`}>
            <span className={`min-w-[14px] font-serif text-[14px] leading-[1.4] ${tone === "after" ? "text-accent" : "text-ink-mute"}`}>{mark}</span>
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ============================================================
   FEATURES
============================================================ */
function Features() {
  const items = [
    { icon: IconCal, title: "Two-way calendar sync", body: "iCloud via CalDAV, Google Calendar, Outlook — set per musician, once. Edits flow both ways. No more reconciling who's looking at what.", tag: "CalDAV · Google · Outlook" },
    { icon: IconChat, title: "Diff-aware SMS", body: "Change the call time and every musician gets a text that says exactly what changed. No re-sending the whole message. No alert fatigue.", tag: "Twilio · A2P 10DLC registered" },
    { icon: IconMail, title: "Email-ready gig sheets", body: "Personalized per musician — each sees only their own pay, their own role. One click, sent. Or downloadable as a PDF that looks like you printed it on real paper.", tag: "PDF · Per-musician" },
    { icon: IconDollar, title: "Pay reconciliation", body: "Client payment, band total, your net. Per-musician pay with paid-status and method — cash, Venmo, Zelle, or check. Replaces the spreadsheet you've been keeping for years.", tag: "Per-gig · Per-musician · Feeds QuickBooks" },
    { icon: IconQbo, title: "One-click QuickBooks push", body: "When every musician on a gig is marked paid, a green Push to QuickBooks button appears. Review once, click once, and the bills post to QBO — each musician as a vendor, each payout as a bill, tied to the gig. No re-keying at tax time.", tag: "QuickBooks Online · Per-gig bill push" },
    { icon: IconPeople, title: "Roster and venues", body: "Musician directory with contact info, pay defaults, calendar preference, and notification settings — they manage their own. Plus a venue database with maps, contacts, and timezone.", tag: "Self-serve preferences" },
    { icon: IconLock, title: "The permission wall", body: "Optional musician login shows their own gigs, their own pay, their own calendar prefs. Never the roster, never the reconciliation, never another musician's amount. Hard wall, no leaks.", tag: "Admin · Member roles" },
    { icon: IconMusic, title: "Set lists & charts", body: "Build a song library once, drop songs into per-gig set lists, attach PDF charts. Musicians get the full kit — set list, charts, gig sheet — in one tap on their phone.", tag: "Per-gig · PDF charts" },
    { icon: IconTruck, title: "GSA mileage & tax-ready", body: "Mileage tracked per gig at the federal GSA rate, mapped automatically to the venue. Year-end CSV ready for your accountant or your 1099 filings. No receipt-shoebox at tax time.", tag: "GSA rate · CSV export" },
  ];
  return (
    <SectionBay id="features" num="02" label="What's inside"
      heading={<>Everything you need to run the gigs you've already <em className="text-accent">booked</em>.</>}
      lede="GigWright isn't trying to be a marketplace, a CRM with ambitions, or a contracts-and-invoicing suite. It's a calendar-synced logistics spine for the working bandleader — and it does that one job exceptionally well."
    >
      <div className="grid grid-cols-1 overflow-hidden rounded-[10px] border border-line bg-line sm:grid-cols-2 lg:grid-cols-4 [&>*]:bg-surface gap-px">
        {items.map(({ icon: Icon, title, body, tag }, i) => (
          <div key={i} className="flex min-h-[240px] flex-col gap-3.5 p-8">
            <div className="mb-1 flex h-8 w-8 items-center justify-center text-accent">
              <Icon />
            </div>
            <h3 className="font-serif text-[20px] font-normal leading-tight tracking-tight">{title}</h3>
            <p className="text-[13.5px] leading-[1.55] text-ink-soft">{body}</p>
            <div className="mt-auto text-[10px] font-medium uppercase tracking-[0.18em] text-ink-mute">
              {tag}
            </div>
          </div>
        ))}
      </div>
    </SectionBay>
  );
}

/* ============================================================
   SYNC SPINE
============================================================ */
function Spine() {
  return (
    <SectionBay num="03" label="The marquee feature"
      heading={<>One edit. <em className="text-accent">Three channels.</em> Always in lockstep.</>}
      lede="This is the part nobody else has built. Change a field on a gig — call time, venue, dress, personnel, anything — and within seconds it's reflected on every musician's calendar, in every musician's text inbox, and on every musician's email confirmation. Diff-aware so you only ping on what actually changed."
    >
      <div className="grid grid-cols-1 items-center gap-14 rounded-[14px] bg-ink p-14 text-paper lg:grid-cols-2">
        <div>
          <div className="mb-4 text-[10px] font-medium uppercase tracking-[0.22em] text-paper/55">
            The sync spine
          </div>
          <h3 className="mb-5 font-serif text-[32px] font-light leading-tight tracking-tight md:text-[36px]">
            You make <em className="text-accent-soft font-light">one</em> change. The whole band knows in seconds.
          </h3>
          <p className="mb-3.5 text-[15px] leading-[1.6] text-paper/80">
            The web app is the source of truth. Every edit becomes a revision. We compare to the last state we notified from — and only fire on fields that actually changed.
          </p>
          <p className="text-[15px] leading-[1.6] text-paper/80">
            No &ldquo;nothing changed but you got a text anyway&rdquo; moments. No phone calls from the bass player asking which downbeat is real.
          </p>
        </div>
        <div className="rounded-[10px] border border-paper/10 bg-paper/5 p-6">
          <div className="rounded-lg bg-accent px-4 py-3.5 text-paper">
            <div className="text-[10px] font-medium uppercase tracking-[0.18em] opacity-75">Edit on GigWright</div>
            <div className="mt-2 font-serif text-[16px]">Downbeat: 7:00 → 8:00 PM</div>
          </div>
          <div className="my-1.5 text-center text-[14px] text-paper/40">↓</div>
          <div className="grid grid-cols-3 gap-2.5">
            <SpineChannel icon={<IconCal />} name="Calendar" det="Event time updated on iCloud, Google, Outlook" />
            <SpineChannel icon={<IconChat />} name="SMS" det="&ldquo;Downbeat now 8:00, was 7:00.&rdquo;" />
            <SpineChannel icon={<IconMail />} name="Email" det="Updated gig sheet, per musician" />
          </div>
        </div>
      </div>
    </SectionBay>
  );
}

function SpineChannel({ icon, name, det }: { icon: React.ReactNode; name: string; det: string }) {
  return (
    <div className="rounded-lg border border-paper/10 bg-paper/5 p-3.5 text-center">
      <div className="mb-2 flex justify-center text-accent-soft">{icon}</div>
      <div className="mb-1 text-[11px] font-medium">{name}</div>
      <div className="text-[10px] leading-[1.4] text-paper/50">{det}</div>
    </div>
  );
}

/* ============================================================
   COMPARISON
============================================================ */
function Compare() {
  const rows: Array<[string, React.ReactNode, React.ReactNode, React.ReactNode]> = [
    ["Two-way calendar sync", <CheckCell key="1" text="iCloud, Google, Outlook" />, <XCell key="2" text="One-way only" />, <PartialCell key="3" text="Google only" />],
    ["SMS notifications", <CheckCell key="1" text="Diff-aware, per musician" />, <XCell key="2" text="Email only" />, <PartialCell key="3" text="For booking, not updates" />],
    ["Per-musician permission wall", <CheckCell key="1" text="Hard, audited" />, <XCell key="2" text="All-or-nothing" />, <PartialCell key="3" text="Member portal" />],
    ["Pay reconciliation", <CheckCell key="1" text="Per-musician + paid-status" />, <XCell key="2" text="Manual" />, <PartialCell key="3" text="Invoicing, not reconciliation" />],
    ["UI built in this decade", <CheckCell key="1" text="2026" />, <XCell key="2" text="~2003" />, <PartialCell key="3" text="Modern, but conventional" />],
    ["Designed by a working bandleader", <CheckCell key="1" text="Yes" />, <XCell key="2" text="No" />, <XCell key="3" text="No" />],
  ];
  return (
    <SectionBay id="vs" num="04" label="The honest moat"
      heading={<>How GigWright stacks up against <em className="text-accent">what&rsquo;s out there</em>.</>}
      lede="No fluff. Side by side, against how working bandleaders are running their gigs today."
    >
      <div className="overflow-hidden rounded-[10px] border border-line bg-surface">
        {/* Head */}
        <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr] border-b border-line bg-paper-warm">
          <div className="px-6 py-5 text-[11px] font-medium uppercase tracking-[0.22em] text-ink-mute">What matters</div>
          <div className="relative bg-ink px-6 py-5 text-[11px] font-medium uppercase tracking-[0.22em] text-paper after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-accent">GigWright</div>
          <div className="px-6 py-5 text-[11px] font-medium uppercase tracking-[0.22em] text-ink-mute">Older booking tools</div>
          <div className="px-6 py-5 text-[11px] font-medium uppercase tracking-[0.22em] text-ink-mute">Other modern tools</div>
        </div>
        {/* Rows */}
        {rows.map(([label, a, b, c], i) => (
          <div key={i} className="grid grid-cols-[1.4fr_1fr_1fr_1fr] border-t border-line">
            <div className="flex items-center bg-paper px-6 py-4 text-[14px] font-medium text-ink">{label}</div>
            <div className="flex items-center bg-accent/[0.04] px-6 py-4 text-[14px] font-medium text-ink">{a}</div>
            <div className="flex items-center px-6 py-4 text-[14px] text-ink-soft">{b}</div>
            <div className="flex items-center px-6 py-4 text-[14px] text-ink-soft">{c}</div>
          </div>
        ))}
      </div>
    </SectionBay>
  );
}

function CheckCell({ text }: { text: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className="font-serif text-[18px] leading-none text-success">●</span>
      <span>{text}</span>
    </span>
  );
}
function XCell({ text }: { text: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className="font-serif text-[18px] leading-none text-ink-mute">○</span>
      <span>{text}</span>
    </span>
  );
}
function PartialCell({ text }: { text: string }) {
  return <span className="font-serif text-[13px] text-warn">{text}</span>;
}

/* ============================================================
   PRICING
============================================================ */
function Pricing() {
  return (
    <SectionBay id="pricing" num="05" label="Pricing"
      heading={<>One simple plan. <em className="text-accent">Cancel anytime.</em></>}
      lede="No tiered confusion, no per-musician fees, no nickel-and-diming on SMS. Your musicians never pay a cent — the member portal is free for them, always."
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.2fr_1fr]">
        {/* Featured plan */}
        <div className="relative rounded-[12px] border border-ink bg-ink p-10 text-paper">
          <span className="absolute right-5 top-5 rounded bg-accent px-2.5 py-1 text-[9px] font-medium uppercase tracking-[0.2em] text-paper">
            14-day free trial
          </span>
          <div className="mb-2 font-serif text-[22px] font-normal tracking-tight">Bandleader</div>
          <div className="mb-7 text-[13px] text-paper/65">For the working pro running their own gigs.</div>
          <div className="mb-2 flex items-baseline gap-1.5">
            <span className="font-serif text-[56px] font-light leading-none tracking-tight">$20</span>
            <span className="text-[14px] text-paper/55">/ month</span>
          </div>
          <div className="mb-7 text-[12px] text-paper/55">Billed monthly · Or $200/year (save $40)</div>
          <ul className="mb-7 list-none">
            {[
              "Unlimited gigs and venues",
              "Unlimited musicians on your roster",
              "Two-way calendar sync · iCloud, Google, Outlook",
              "SMS + email notifications, diff-aware",
              "Pay reconciliation per gig and per musician",
              "Personalized email gig sheets and PDFs",
              "Member portal access for every musician (free)",
              "500 SMS messages / month included",
            ].map((b, i) => (
              <li key={b} className={`flex items-start gap-3 py-2.5 text-[13.5px] leading-[1.5] text-paper/85 ${i > 0 ? "border-t border-paper/10" : ""}`}>
                <span className="font-serif text-accent-soft">+</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
          <Link
            href={START}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-paper px-5 py-3.5 text-[14px] font-semibold text-ink transition-colors hover:bg-white"
          >
            <span>Start your free trial</span>
            <span className="font-serif text-[16px] font-light opacity-85">→</span>
          </Link>
        </div>

        {/* Side card — misc answers */}
        <div className="rounded-[12px] border border-line bg-surface p-10">
          <div className="mb-2 font-serif text-[22px] font-normal tracking-tight">For the rest</div>
          <div className="mb-6 text-[13px] text-ink-soft">A few quick answers about what&rsquo;s not on the price sheet.</div>
          <div className="flex flex-col gap-6">
            <SideNote
              kicker="For musicians on your roster"
              title="Always free."
              body="They get the member portal, calendar sync, SMS, and email — at no cost. You're the only one paying."
            />
            <SideNote
              kicker="Coming in Phase 1.5"
              title="Contracts & e-sign"
              body="A &ldquo;Book Patrick&rdquo; public inquiry page, full 1099 export, and contract e-signing — included in the same monthly price when shipped."
            />
            <SideNote
              kicker="Annual savings"
              title="Pay yearly, save two months."
              body="$200/year if you commit upfront. Or pay monthly with no contract."
            />
          </div>
        </div>
      </div>
    </SectionBay>
  );
}

function SideNote({ kicker, title, body }: { kicker: string; title: string; body: string }) {
  return (
    <div>
      <div className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.22em] text-ink-mute">{kicker}</div>
      <div className="mb-1 font-serif text-[18px] font-normal">{title}</div>
      <div className="text-[13px] leading-[1.5] text-ink-soft">{body}</div>
    </div>
  );
}

/* ============================================================
   FAQ
============================================================ */
function Faq() {
  const qs: Array<[string, string]> = [
    ["Do my musicians need to pay anything?",
      "No. Musicians on your roster get the member portal, calendar sync, SMS, and email at no cost. You're the only one paying — they just receive the gig info, on whichever calendar and notification channel they prefer."],
    ["How does iCloud calendar sync actually work?",
      "Through CalDAV, Apple's calendar protocol. Each musician generates an app-specific password from appleid.apple.com, pastes it into GigWright once, and from then on every edit flows both ways. We handle all the polling, retries, and rate-limit handling. They just see their gig appear, update, or move on the iPhone calendar app they already use."],
    ["What about Google Calendar and Outlook?",
      "Same idea, with OAuth instead of app passwords. Each musician picks their own provider once, and GigWright routes their calendar updates to the right place. Mix and match across the band — three musicians on iCloud, two on Google, one on Outlook is fine."],
    ["What does \u201Cdiff-aware SMS\u201D actually mean?",
      "When you change a gig, we compare the new state to the last state we notified about. If only the call time changed, the SMS reads \u201CCall time updated to 5:30 (was 5:00).\u201D If you fix a typo in the venue address, no SMS fires at all — there's nothing meaningful to communicate. The result: musicians trust the texts because every text means something actually changed."],
    ["Can my musicians see each other's pay?",
      "No. Each musician sees only their own pay, their own gigs, their own calendar preferences. The roster, the reconciliation totals (client pays / band total / your net), and other musicians' amounts are admin-only. This is a hard wall — not a setting you have to remember to flip."],
    ["I already use another booking tool. How hard is the switch?",
      "Bring a CSV of your gigs and roster — we import them. Your musicians get a friendly setup link to choose their calendar provider, and that's it. Most bandleaders are running on GigWright within an afternoon."],
    ["What about contracts, invoices, and accepting payments?",
      "Phase 1.5 — coming after the v1 sync spine is rock solid. Contracts and e-sign, a public \u201CBook me\u201D inquiry page, and full 1099 export are on the roadmap and included at the same price when they ship."],
    ["Who's behind GigWright?",
      "Patrick Lamb — saxophonist, bandleader, and producer in Palm Beach. Built because every existing tool failed at the one thing that matters most: keeping the band in sync when something changes at 3pm on a gig day. Built using the tool live, gig after gig, before opening it up to other bandleaders."],
  ];
  return (
    <SectionBay id="faq" num="06" label="Common questions"
      heading={<>Things bandleaders ask <em className="text-accent">before signing up</em>.</>}
    >
      <div className="mx-auto max-w-[880px]">
        {qs.map(([q, a], i) => (
          <details key={i} className={`group cursor-pointer border-t border-line py-5 ${i === qs.length - 1 ? "border-b" : ""}`}>
            <summary className="flex list-none items-center justify-between font-serif text-[19px] font-normal tracking-tight [&::-webkit-details-marker]:hidden">
              <span>{q}</span>
              <span className="font-serif text-[22px] font-light text-accent transition-transform group-open:rotate-45">+</span>
            </summary>
            <div className="mt-4 max-w-[700px] text-[14.5px] leading-[1.6] text-ink-soft">{a}</div>
          </details>
        ))}
      </div>
    </SectionBay>
  );
}

/* ============================================================
   CTA BAND
============================================================ */
function CtaBand() {
  return (
    <section className="bg-ink py-18 text-paper">
      <div className="mx-auto max-w-[1240px] px-8 text-center">
        <h2 className="mx-auto mb-5 max-w-[720px] font-serif text-[40px] font-light leading-[1.05] tracking-tight md:text-[48px]">
          Stop running your gigs out of <em className="font-light text-accent-soft">email and group texts</em>.
        </h2>
        <p className="mb-8 text-[16px] text-paper/70">
          14-day free trial. No card required. Your musicians never pay.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link
            href={START}
            className="inline-flex items-center gap-2 rounded-md bg-accent px-6 py-3.5 text-[14px] font-semibold text-paper transition-colors hover:bg-[#611B11]"
          >
            <span>Start your free trial</span>
            <span className="font-serif text-[16px] font-light opacity-85">→</span>
          </Link>
          <a
            href="#features"
            className="inline-flex items-center gap-2 rounded-md border border-paper/20 bg-transparent px-6 py-3.5 text-[14px] font-semibold text-paper transition-colors hover:bg-paper/10"
          >
            See features again
          </a>
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   FOOTER
============================================================ */
function Footer() {
  return (
    <footer className="border-t border-line bg-paper-warm py-14">
      <div className="mx-auto max-w-[1240px] px-8">
        <div className="mb-12 grid grid-cols-1 gap-10 md:grid-cols-[2fr_1fr_1fr_1fr]">
          <div>
            <Link href="/" className="mb-3.5 inline-block font-serif text-[26px] font-medium tracking-tight">
              Gig<em className="font-light text-accent">Wright</em>
            </Link>
            <p className="max-w-[320px] text-[13px] leading-[1.6] text-ink-soft">
              The booking management platform for working bandleaders. Built in Palm Beach. Used at every gig before it shipped.
            </p>
          </div>
          <FooterCol
            heading="Product"
            links={[
              ["Features", "#features"],
              ["How it compares", "#vs"],
              ["Pricing", "#pricing"],
              ["FAQ", "#faq"],
              ["Sign in", "/signin"],
            ]}
          />
          <FooterCol
            heading="Company"
            links={[
              ["About", "/about"],
              ["Contact", "mailto:hello@gigwright.com"],
            ]}
          />
          <FooterCol
            heading="Legal"
            links={[
              ["Privacy", "/privacy"],
              ["Terms", "/terms"],
            ]}
          />
        </div>
        <div className="flex flex-col items-center justify-between gap-3 border-t border-line pt-6 text-[12px] text-ink-mute md:flex-row">
          <div>© 2026 GigWright. Built in Palm Beach, Florida.</div>
          <a href="mailto:hello@gigwright.com" className="hover:text-ink">hello@gigwright.com</a>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ heading, links }: { heading: string; links: Array<[string, string]> }) {
  return (
    <div>
      <h5 className="mb-4 text-[10px] font-medium uppercase tracking-[0.22em] text-ink-mute">{heading}</h5>
      <ul className="flex list-none flex-col gap-2.5">
        {links.map(([label, href]) => (
          <li key={label}>
            <a href={href} className="text-[13px] text-ink-soft hover:text-ink">{label}</a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ============================================================
   SECTION SHELL
============================================================ */
function SectionBay({
  id,
  num,
  label,
  heading,
  lede,
  children,
}: {
  id?: string;
  num: string;
  label: string;
  heading: React.ReactNode;
  lede?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="border-b border-line py-24">
      <div className="mx-auto max-w-[1240px] px-8">
        <div className="mb-14 grid grid-cols-1 items-end gap-4 md:grid-cols-[auto_1fr] md:gap-12">
          <div className="font-serif text-[44px] font-light leading-none text-accent/70 md:text-[64px]">{num}</div>
          <div>
            <span className="mb-3 block text-[11px] font-medium uppercase tracking-[0.22em] text-ink-mute">{label}</span>
            <h2 className="max-w-[720px] font-serif text-[32px] font-light leading-[1.05] tracking-tight md:text-[44px]">
              {heading}
            </h2>
            {lede && (
              <p className="mt-4 max-w-[620px] text-[15px] leading-[1.55] text-ink-soft md:text-[16px]">
                {lede}
              </p>
            )}
          </div>
        </div>
        {children}
      </div>
    </section>
  );
}

/* ============================================================
   ICONS (inline SVG, 22px, stroke 1.5)
============================================================ */
function IconCal() {
  return (<svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>);
}
function IconChat() {
  return (<svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>);
}
function IconMail() {
  return (<svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 5L2 7" /></svg>);
}
function IconDollar() {
  return (<svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>);
}
function IconQbo() {
  return (<svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M20 12V8H6a2 2 0 0 1 0-4h12v4" /><path d="M4 6v12a2 2 0 0 0 2 2h14v-4" /><path d="M18 12a2 2 0 0 0 0 4h4v-4z" /></svg>);
}
function IconPeople() {
  return (<svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /><circle cx="8.5" cy="7" r="4" /></svg>);
}
function IconLock() {
  return (<svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>);
}
function IconMusic() {
  return (<svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /><path d="M9 18V6l12-2v12" /></svg>);
}
function IconTruck() {
  return (<svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M5 17h14M3 17l3-9h12l3 9M7 13h10" /><circle cx="7.5" cy="17.5" r="1.5" /><circle cx="16.5" cy="17.5" r="1.5" /></svg>);
}
