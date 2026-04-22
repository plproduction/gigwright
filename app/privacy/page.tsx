import Link from "next/link";

// Privacy policy for GigWright. Adapted from the Patrick Lamb Productions
// draft for gigwright.com specifically — covers the booking management app,
// musician portal, SMS fanout, and calendar/QBO integrations.

export const metadata = {
  title: "Privacy Policy · GigWright",
  description:
    "How GigWright collects, uses, and protects information from bandleaders and the musicians on their rosters.",
};

export default function PrivacyPage() {
  return (
    <div className="bg-paper text-ink">
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
          Legal
        </div>
        <h1 className="mb-3 font-serif text-[44px] font-light leading-tight tracking-tight">
          Privacy Policy
        </h1>
        <p className="mb-12 text-[13px] text-ink-mute">Effective Date: April 22, 2026</p>

        <Prose>
          <p>
            Patrick Lamb Productions (&ldquo;we,&rdquo; &ldquo;our,&rdquo; &ldquo;us&rdquo;) operates GigWright (&ldquo;the Service&rdquo;) at gigwright.com. This Privacy Policy explains what information we collect, how we use it, and your rights regarding it.
          </p>

          <H2>Information We Collect</H2>
          <H3>Information you provide directly</H3>
          <ul>
            <li>Your name, email address, and phone number when you sign up as a bandleader or are added to a bandleader&rsquo;s roster as a musician</li>
            <li>Venue and gig details you enter into the Service (call times, addresses, pay, notes, set lists)</li>
            <li>Roster details you add about your musicians (pay defaults, notification preferences, W-9 status)</li>
            <li>Billing information when you subscribe to a paid plan (handled by Stripe &mdash; we do not store card numbers)</li>
          </ul>

          <H3>Information collected automatically</H3>
          <ul>
            <li>IP address, browser type, and device information</li>
            <li>Authentication session data (required to keep you signed in)</li>
            <li>Error logs and basic usage telemetry</li>
          </ul>

          <H3>Information collected from integrations</H3>
          <ul>
            <li>Calendar event data when you connect iCloud, Google, or Outlook</li>
            <li>Vendor and bill records when you connect QuickBooks Online</li>
            <li>Contact data imported from third-party tools with your permission (e.g. Where&rsquo;s The Gig migration)</li>
          </ul>

          <H2>How We Use Information</H2>
          <ul>
            <li>Operate the Service: manage your gigs, roster, payouts, and set lists</li>
            <li>Send operational email and SMS to musicians on your roster about gigs they&rsquo;re assigned to &mdash; call times, venue details, updates, morning-of reminders</li>
            <li>Process subscription billing and send receipts</li>
            <li>Sync changes to connected calendars and accounting systems you have explicitly authorized</li>
            <li>Respond to support requests</li>
            <li>Improve the Service</li>
            <li>Comply with legal and tax obligations</li>
          </ul>

          <H2>SMS Communications</H2>
          <p>
            Phone numbers collected in GigWright are used solely to send operational information to musicians booked on gigs &mdash; call times, venue details, updates, and morning-of reminders. We do not use phone numbers for marketing, and we do not share them with third parties for marketing purposes.
          </p>
          <p>
            Recipients can opt out at any time by replying <strong>STOP</strong>, <strong>UNSUBSCRIBE</strong>, or <strong>END</strong>. Replying <strong>HELP</strong> returns contact information for the bandleader and for GigWright support.
          </p>

          <H2>The Permission Wall</H2>
          <p>
            Musicians added to a bandleader&rsquo;s roster can only see gigs they are personally assigned to, and only their own pay on those gigs. They cannot see the roster as a whole, the client-paid amount, the band total, other musicians&rsquo; pay, expenses, or net. This separation is enforced server-side on every request.
          </p>

          <H2>Sharing of Information</H2>
          <p>We do not sell your personal information.</p>
          <p>We share information only with:</p>
          <ul>
            <li>
              <strong>Service providers</strong> who help us operate GigWright, under contractual obligations to protect your data: Vercel (application hosting), Neon (database hosting), Resend (email delivery), Twilio (SMS delivery), Stripe (subscription billing), Intuit / QuickBooks Online (accounting sync, only if you connect it), Apple iCloud / Google / Microsoft (calendar sync, only if you connect it), and Vercel Blob (file storage for PDFs and avatars).
            </li>
            <li>
              <strong>Legal or regulatory authorities</strong> when required by law.
            </li>
          </ul>

          <H2>Data Retention</H2>
          <p>
            We retain your data for as long as your GigWright account is active. If you cancel, we retain records required for tax or legal compliance (typically up to seven years) and then delete the rest. You may request earlier deletion by emailing us at any time.
          </p>

          <H2>Your Rights</H2>
          <ul>
            <li>Access the personal information we hold about you</li>
            <li>Correct inaccurate information (most fields are directly editable in the Service)</li>
            <li>Request deletion of your information</li>
            <li>Opt out of communications (reply STOP for SMS, use the unsubscribe link for email)</li>
            <li>Export your data on request</li>
          </ul>
          <p>
            If you are a resident of California, the European Union, or another jurisdiction with specific privacy rights (such as the CCPA or GDPR), you have additional rights under applicable law, including the right to lodge a complaint with a supervisory authority.
          </p>

          <H2>Children&rsquo;s Privacy</H2>
          <p>
            GigWright is not directed to individuals under 18. We do not knowingly collect personal information from children. If we learn that we have, we will delete it promptly.
          </p>

          <H2>Security</H2>
          <p>
            We use reasonable administrative, technical, and physical safeguards to protect your information, including encryption in transit, password-less magic-link authentication, and vetted third-party service providers. No method of transmission over the internet is entirely secure, and we cannot guarantee absolute security.
          </p>

          <H2>Changes to This Policy</H2>
          <p>
            We may update this Privacy Policy from time to time. We will post the revised policy on this page with an updated effective date. Continued use of the Service after changes constitutes acceptance.
          </p>

          <H2>Contact Us</H2>
          <p>
            For privacy questions, data requests, or opt-out requests:
          </p>
          <p>
            <strong>Patrick Lamb Productions</strong>
            <br />
            Email: <a href="mailto:patrick@patricklamb.com" className="text-accent underline-offset-4 hover:underline">patrick@patricklamb.com</a>
            <br />
            Or: <a href="mailto:hello@gigwright.com" className="text-accent underline-offset-4 hover:underline">hello@gigwright.com</a>
          </p>
        </Prose>
      </main>

      <footer className="border-t border-line bg-paper-warm py-10">
        <div className="mx-auto max-w-[1240px] px-8 text-center text-[12px] text-ink-mute">
          © 2026 GigWright · <Link href="/privacy" className="hover:text-ink">Privacy</Link> · <Link href="/terms" className="hover:text-ink">Terms</Link>
        </div>
      </footer>
    </div>
  );
}

function Prose({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-5 text-[15px] leading-[1.7] text-ink-soft [&_h2]:mb-3 [&_h2]:mt-10 [&_h2]:font-serif [&_h2]:text-[22px] [&_h2]:font-normal [&_h2]:tracking-tight [&_h2]:text-ink [&_h3]:mb-2 [&_h3]:mt-5 [&_h3]:text-[13px] [&_h3]:font-semibold [&_h3]:uppercase [&_h3]:tracking-[0.12em] [&_h3]:text-ink [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-2 [&_strong]:font-semibold [&_strong]:text-ink">
      {children}
    </div>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2>{children}</h2>;
}
function H3({ children }: { children: React.ReactNode }) {
  return <h3>{children}</h3>;
}
