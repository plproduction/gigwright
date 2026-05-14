import Link from "next/link";
import { submitSmsOptIn, CONSENT_TEXT } from "./actions";

// Public SMS opt-in form. This is the TCR-verifiable Call to Action for
// our A2P 10DLC campaign — a carrier or TCR reviewer can navigate here,
// submit it, see a confirmation, and verify a row landed in the DB.
//
// Design intent: this is intentionally a serious-feeling, hand-set
// looking legal-leaning form rather than a marketing landing page.
// It pairs with /sms-consent (the longer policy doc), /privacy, and
// /terms. The form lives under the marketing site theme but the
// language is straight from CTIA's recommended disclosures so a TCR
// reviewer ticks every box from their checklist while reading it.

export const metadata = {
  title: "SMS Opt-In · GigWright",
  description:
    "Sign up to receive operational SMS gig-coordination messages from a bandleader using GigWright.",
};

export default async function SmsOptInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  const error = sp.error;

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
          SMS Opt-In
        </div>
        <h1 className="mb-4 font-serif text-[40px] font-light leading-tight tracking-tight">
          Sign up for GigWright SMS
        </h1>
        <p className="mb-10 text-[15px] leading-[1.65] text-ink-soft">
          GigWright sends operational text messages about live-music gigs you&rsquo;ve
          been booked on — call time, venue details, set-list updates, and
          morning-of-gig reminders — on behalf of the bandleader who hired you.
          Use this form to opt in directly. (If a bandleader has already added you
          to their GigWright roster offline, you&rsquo;re also already opted in.)
        </p>

        {error && <ErrorBanner code={error} />}

        <form
          action={submitSmsOptIn}
          className="rounded-[10px] border border-line bg-paper-warm/40 p-7"
        >
          <div className="grid grid-cols-1 gap-5">
            <Field label="Your name" required>
              <input
                type="text"
                name="name"
                required
                autoComplete="name"
                placeholder="Jane Doe"
                className="w-full rounded-md border border-line-strong bg-paper px-3 py-2.5 text-[14px] text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              />
            </Field>

            <Field label="Mobile phone number" required help="US numbers only · we&rsquo;ll send a confirmation to this phone">
              <input
                type="tel"
                name="phone"
                required
                autoComplete="tel"
                inputMode="tel"
                placeholder="(555) 555-1234"
                className="w-full rounded-md border border-line-strong bg-paper px-3 py-2.5 text-[14px] text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              />
            </Field>

            <Field
              label="Bandleader who hired you"
              help="Optional — helps us match this opt-in to your gigs"
            >
              <input
                type="text"
                name="bandleader"
                autoComplete="off"
                placeholder="e.g. Patrick Lamb"
                className="w-full rounded-md border border-line-strong bg-paper px-3 py-2.5 text-[14px] text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              />
            </Field>

            {/* Consent block — the legally important bit. Each disclosure
                CTIA looks for is present and clearly labeled: program
                description, msg frequency, data rates, HELP, STOP, links
                to privacy + terms. The checkbox is required and
                unchecked by default. */}
            <div className="mt-2 rounded-md border border-accent/20 bg-paper p-5">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  name="consent"
                  value="yes"
                  required
                  className="mt-1 h-4 w-4 cursor-pointer accent-accent"
                />
                <span className="text-[13px] leading-[1.7] text-ink">
                  <strong>I agree to receive operational SMS from GigWright</strong>{" "}
                  on behalf of the bandleader who hired me. Messages contain gig
                  coordination details (venue, call time, downbeat, address,
                  attire, set-list updates, morning-of reminders, and changes
                  to any of the above).{" "}
                  <strong>Message frequency varies</strong> — typically 0&ndash;10
                  messages per gig and 1&ndash;20 per month.{" "}
                  <strong>Message and data rates may apply.</strong> Reply{" "}
                  <strong>HELP</strong> for help,{" "}
                  <strong>STOP</strong> to opt out at any time. See our{" "}
                  <Link
                    href="/privacy"
                    className="text-accent underline-offset-4 hover:underline"
                  >
                    Privacy Policy
                  </Link>{" "}
                  and{" "}
                  <Link
                    href="/terms"
                    className="text-accent underline-offset-4 hover:underline"
                  >
                    Terms of Service
                  </Link>
                  . Full{" "}
                  <Link
                    href="/sms-consent"
                    className="text-accent underline-offset-4 hover:underline"
                  >
                    SMS Consent &amp; Opt-In policy
                  </Link>{" "}
                  details what you&rsquo;re agreeing to.
                </span>
              </label>
            </div>

            <button
              type="submit"
              className="mt-2 inline-flex items-center justify-center gap-2 rounded-md bg-accent px-5 py-3 text-[14px] font-semibold text-paper transition-colors hover:bg-[#5E1812]"
            >
              <span>Sign me up</span>
              <span className="font-serif text-[16px] font-light opacity-90">→</span>
            </button>
          </div>
        </form>

        <div className="mt-10 border-t border-line pt-6 text-[12px] leading-[1.65] text-ink-mute">
          <p className="mb-3">
            Mobile information will not be shared with third parties or
            affiliates for marketing or promotional purposes. Phone numbers
            collected here are used solely for operational gig-coordination
            SMS sent on behalf of the bandleader who hired you.
          </p>
          <p>
            Already opted in via your bandleader and want to stop? Reply{" "}
            <strong>STOP</strong> to any GigWright message and you&rsquo;ll be
            unsubscribed immediately. Need help? Email{" "}
            <a
              href="mailto:hello@gigwright.com"
              className="text-accent underline-offset-4 hover:underline"
            >
              hello@gigwright.com
            </a>
            .
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

function Field({
  label,
  required,
  help,
  children,
}: {
  label: string;
  required?: boolean;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-mute">
        {label}
        {required && <span className="ml-1 text-accent">*</span>}
      </span>
      {children}
      {help && (
        <span
          className="text-[11px] leading-[1.45] text-ink-mute"
          dangerouslySetInnerHTML={{ __html: help }}
        />
      )}
    </label>
  );
}

function ErrorBanner({ code }: { code: string }) {
  const messages: Record<string, string> = {
    "missing-phone": "Please enter your mobile phone number.",
    "missing-name": "Please enter your name.",
    "missing-consent": "Please check the consent box to opt in.",
    "invalid-phone":
      "That phone number doesn't look right — please enter a US 10-digit number.",
  };
  const message = messages[code] ?? "Something went wrong. Please try again.";
  return (
    <div className="mb-6 rounded-md border border-accent/40 bg-accent/5 px-4 py-3 text-[13px] text-accent">
      {message}
    </div>
  );
}
