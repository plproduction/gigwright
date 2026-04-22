import Link from "next/link";
import { requireUser } from "@/lib/session";

// "Bring your data over" page. Right now imports are a concierge process —
// we do them for you. A proper UI-driven CSV importer is on the roadmap;
// until then this page sets expectations and gives you an easy handoff.
export default async function ImportPage() {
  await requireUser();

  return (
    <>
      <div className="mb-6 flex items-baseline justify-between border-b border-line pb-3">
        <h4 className="font-serif text-[22px] font-normal tracking-tight">
          Import existing data
        </h4>
      </div>

      <div className="mx-auto max-w-[720px] space-y-6">
        <div className="rounded-[10px] border border-line bg-surface p-6">
          <h5 className="mb-2 font-serif text-[20px] font-normal tracking-tight">
            Concierge migration
          </h5>
          <p className="mb-4 text-[14px] leading-[1.6] text-ink-soft">
            Moving from Where&rsquo;s The Gig, Gigster, Muzeek, Excel, or anything
            else? Send us whatever you&rsquo;ve got &mdash; a CSV, a screenshot,
            login to the old tool, or just a written list &mdash; and we&rsquo;ll
            move the venues, roster, and gig history for you within 24 hours.
            Usually faster.
          </p>
          <p className="mb-4 text-[14px] leading-[1.6] text-ink-soft">
            The API endpoint and bulk-upsert logic are already in place on our
            side; the only reason this isn&rsquo;t a self-serve UI yet is that
            every migration looks different enough that a human eye catches
            problems a wizard misses.
          </p>
          <a
            href="mailto:hello@gigwright.com?subject=Import%20request"
            className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2.5 text-[13px] font-semibold text-paper transition-colors hover:bg-[#611B11]"
          >
            Email us your data
            <span className="font-serif text-[14px] font-light opacity-85">→</span>
          </a>
        </div>

        <div className="rounded-[10px] border border-line bg-paper-warm p-6">
          <h5 className="mb-2 font-serif text-[18px] font-normal tracking-tight">
            What we can pull in
          </h5>
          <ul className="space-y-2 text-[13.5px] leading-[1.6] text-ink-soft">
            <li className="flex gap-2"><span className="text-accent">+</span>Venues &mdash; name, address, phone, notes.</li>
            <li className="flex gap-2"><span className="text-accent">+</span>Musicians / roster &mdash; name, email, phone, instrument, default pay, payment method.</li>
            <li className="flex gap-2"><span className="text-accent">+</span>Gig history &mdash; date, venue, status, personnel, pay, notes. Up to a decade of backlog.</li>
            <li className="flex gap-2"><span className="text-accent">+</span>Per-musician 1099 totals &mdash; if your source system has them, we keep them aligned with tax year.</li>
          </ul>
        </div>

        <p className="text-center text-[12px] text-ink-mute">
          Don&rsquo;t want to hand anything over? You can add rows manually on{" "}
          <Link href="/roster" className="text-accent hover:underline">Roster</Link>,{" "}
          <Link href="/venues" className="text-accent hover:underline">Venues</Link>, and{" "}
          <Link href="/gigs/new" className="text-accent hover:underline">New gig</Link> any time.
        </p>
      </div>
    </>
  );
}
