import Link from "next/link";

// Confirmation page shown after a successful SMS opt-in submission.
// Important for two audiences:
//  1. The end-user — proves their consent was captured and tells them
//     what to expect next.
//  2. A TCR / carrier reviewer testing the CTA — proves the form
//     actually works end-to-end and produces a real confirmation page,
//     not just a JavaScript alert.
//
// We echo the last-4 of the phone (passed in the query string) so the
// user can verify the right number was captured.

export const metadata = {
  title: "You're opted in · GigWright SMS",
  description: "Confirmation that your GigWright SMS opt-in was recorded.",
};

export default async function SmsOptInSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ phone?: string; name?: string }>;
}) {
  const sp = await searchParams;
  const last4 = sp.phone ?? "";
  const name = sp.name ?? "";

  return (
    <div className="bg-paper text-ink">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-[760px] items-center justify-between px-8 py-4">
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

      <main className="mx-auto max-w-[640px] px-8 py-16">
        <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">
          Confirmed
        </div>
        <h1 className="mb-4 font-serif text-[40px] font-light leading-tight tracking-tight">
          {name ? <>Thanks, {name}.</> : <>You&rsquo;re signed up.</>}
        </h1>
        <p className="mb-10 text-[15px] leading-[1.65] text-ink-soft">
          {last4 ? (
            <>
              Your consent was recorded for the mobile number ending in{" "}
              <strong className="text-ink">{escapeHtml(last4)}</strong>. You&rsquo;ll
              receive operational SMS from GigWright on behalf of the bandleader
              who hired you.
            </>
          ) : (
            <>
              Your consent was recorded. You&rsquo;ll receive operational SMS from
              GigWright on behalf of the bandleader who hired you.
            </>
          )}
        </p>

        <section className="mb-10 rounded-[10px] border border-line bg-paper-warm/40 p-7">
          <h2 className="mb-3 font-serif text-[20px] font-normal tracking-tight">
            What to expect
          </h2>
          <ul className="space-y-2.5 text-[14px] leading-[1.6] text-ink">
            <li>
              <strong>Gig info</strong> when you&rsquo;re booked — venue, call
              time, downbeat, address, attire.
            </li>
            <li>
              <strong>Updates</strong> if anything changes about a gig
              you&rsquo;re scheduled to play.
            </li>
            <li>
              <strong>Morning-of-gig reminders</strong> with the key details.
            </li>
            <li>
              <strong>Set-list links</strong> when the bandleader posts the
              charts.
            </li>
          </ul>
          <p className="mt-4 text-[12px] leading-[1.55] text-ink-mute">
            Typical volume: 0&ndash;10 messages per gig, 1&ndash;20 per month
            depending on the bandleader&rsquo;s schedule. No marketing, no
            promotional content. Message and data rates may apply.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">
            Opt out or get help, any time
          </h2>
          <ul className="space-y-2 text-[14px] leading-[1.6] text-ink">
            <li>
              Reply <strong>STOP</strong> (or UNSUBSCRIBE, CANCEL, QUIT, END)
              to any GigWright message and you&rsquo;re unsubscribed immediately.
            </li>
            <li>
              Reply <strong>HELP</strong> to any message for support contact
              info.
            </li>
            <li>
              Or email{" "}
              <a
                href="mailto:hello@gigwright.com"
                className="text-accent underline-offset-4 hover:underline"
              >
                hello@gigwright.com
              </a>
              .
            </li>
          </ul>
        </section>

        <div className="border-t border-line pt-6 text-[12px] leading-[1.65] text-ink-mute">
          <p>
            Mobile information will not be shared with third parties or
            affiliates for marketing or promotional purposes. See our{" "}
            <Link
              href="/privacy"
              className="text-accent underline-offset-4 hover:underline"
            >
              Privacy Policy
            </Link>{" "}
            and{" "}
            <Link
              href="/sms-consent"
              className="text-accent underline-offset-4 hover:underline"
            >
              SMS Consent &amp; Opt-In policy
            </Link>{" "}
            for full details.
          </p>
        </div>
      </main>

      <footer className="border-t border-line bg-paper-warm py-10">
        <div className="mx-auto max-w-[760px] px-8 text-center text-[12px] text-ink-mute">
          © 2026 GigWright ·{" "}
          <Link href="/privacy" className="hover:text-ink">
            Privacy
          </Link>{" "}
          ·{" "}
          <Link href="/terms" className="hover:text-ink">
            Terms
          </Link>{" "}
          ·{" "}
          <Link href="/sms-consent" className="hover:text-ink">
            SMS consent
          </Link>{" "}
          ·{" "}
          <Link href="/sms-opt-in" className="hover:text-ink">
            SMS opt-in
          </Link>
        </div>
      </footer>
    </div>
  );
}

// Defensive HTML escape on the phone last-4 in case anything funny gets
// in the URL query string. The Next.js renderer escapes by default for
// string children but this makes the intent explicit.
function escapeHtml(s: string): string {
  return s.replace(/[<>&"]/g, (c) =>
    c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === "&" ? "&amp;" : "&quot;",
  );
}
