import Link from "next/link";
import { requireUser } from "@/lib/session";

// Finance for now lives entirely on each gig's Payout Worksheet.
// This tab is a lightweight landing that points there.
export default async function FinancePage() {
  await requireUser();

  return (
    <>
      <div className="mb-6 flex items-baseline justify-between border-b border-line pb-3">
        <h4 className="font-serif text-[22px] font-normal tracking-tight">
          Finance
        </h4>
      </div>

      <div className="py-10 text-center">
        <div className="font-serif text-[22px] font-normal tracking-tight">
          Finance is per-gig.
        </div>
        <p className="mx-auto mt-3 max-w-[520px] text-[14px] leading-[1.55] text-ink-soft">
          Every gig has its own Excel-style payout worksheet with contractors,
          expenses, and running totals for admin subscribers.
        </p>
        <Link
          href="/dashboard"
          className="mt-5 inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-[13px] font-semibold text-paper hover:bg-[#611B11]"
        >
          Open the gig list
        </Link>
      </div>
    </>
  );
}
