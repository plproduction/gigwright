import Link from "next/link";

// Minimal Terms of Service so the footer link doesn't 404. Placeholder while
// a proper ToS is drafted — covers the basics honestly and points to
// contact for everything else.

export const metadata = {
  title: "Terms of Service · GigWright",
  description: "Terms of service for GigWright.",
};

export default function TermsPage() {
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
          Terms of Service
        </h1>
        <p className="mb-12 text-[13px] text-ink-mute">Effective Date: April 22, 2026</p>

        <div className="space-y-5 text-[15px] leading-[1.7] text-ink-soft [&_h2]:mb-3 [&_h2]:mt-10 [&_h2]:font-serif [&_h2]:text-[22px] [&_h2]:font-normal [&_h2]:tracking-tight [&_h2]:text-ink">
          <p>
            By creating a GigWright account or using the Service, you agree to these Terms. If you don&rsquo;t agree, please don&rsquo;t use the Service.
          </p>

          <h2>The Service</h2>
          <p>
            GigWright (operated by Patrick Lamb Productions) is a booking management web application for working bandleaders. It lets you manage gigs, your musician roster, venues, pay reconciliation, set lists, and send operational notifications to musicians assigned to your gigs.
          </p>

          <h2>Your Account</h2>
          <p>
            You&rsquo;re responsible for the information you provide and the activity on your account. Keep your sign-in method (magic link email) secure. Musicians on your roster who sign in see only their own gigs, per our permission wall described in the Privacy Policy.
          </p>

          <h2>Acceptable Use</h2>
          <p>
            Don&rsquo;t use GigWright to send spam or marketing SMS, scrape user data, violate any law, or harm others. SMS messages are reserved for operational communication with musicians you have personally hired.
          </p>

          <h2>SMS Messaging Program (GigWright Operational Notifications)</h2>
          <p>
            <strong>Program description.</strong> GigWright sends operational
            text messages to musicians who have been added to a bandleader&rsquo;s
            roster on the Service. Messages contain gig details (venue, call
            time, downbeat, address, attire), real-time updates when those
            details change, morning-of-gig reminders, and links back to the
            full gig sheet on gigwright.com. We do not send marketing or
            promotional content.
          </p>
          <p>
            <strong>How recipients opt in.</strong> When a bandleader adds a
            musician to their roster on gigwright.com, the musician receives
            an invite email at the email address provided. The musician opts
            in to SMS by (a) replying YES to a confirmation text from the
            bandleader, or (b) signing in to gigwright.com and leaving the
            &ldquo;Notify by SMS&rdquo; setting enabled on their profile, or (c)
            confirming verbally to the bandleader as part of the gig booking
            conversation. By doing any of the above, the musician agrees to
            receive operational SMS from GigWright on behalf of the
            bandleader who hired them.
          </p>
          <p>
            <strong>Message frequency.</strong> Frequency varies by
            bandleader and gig calendar. Typical volume is 1&ndash;5 messages
            per gig (initial confirmation, change notifications if any, and
            a morning-of reminder).
          </p>
          <p>
            <strong>Message and data rates.</strong> <em>Message and data rates may apply.</em> Carriers may charge for incoming and outgoing SMS. GigWright does not charge musicians for receiving these messages.
          </p>
          <p>
            <strong>HELP keyword.</strong> Reply <strong>HELP</strong> to any
            GigWright message to receive support instructions. You can also
            email <a href="mailto:hello@gigwright.com" className="text-accent underline-offset-4 hover:underline">hello@gigwright.com</a> for help.
          </p>
          <p>
            <strong>STOP keyword.</strong> You can opt out of GigWright SMS
            at any time by replying <strong>STOP</strong> to any GigWright
            message. You will receive one final confirmation text and then no
            further messages from that bandleader. To opt back in, reply
            START or re-enable SMS in your GigWright profile.
          </p>
          <p>
            <strong>Carrier disclaimer.</strong> Wireless carriers are not
            liable for delayed or undelivered messages.
          </p>
          <p>
            <strong>Support.</strong> For questions about the GigWright SMS
            program, email <a href="mailto:hello@gigwright.com" className="text-accent underline-offset-4 hover:underline">hello@gigwright.com</a>.
          </p>

          <h2>Subscription and Billing</h2>
          <p>
            Paid plans are billed monthly or annually through Stripe. You can cancel anytime from your account. If you cancel during a billing period, your subscription remains active until the end of that period; we don&rsquo;t refund partial months. Free trials don&rsquo;t require a card to start; you&rsquo;ll be prompted for payment before your trial ends.
          </p>

          <h2>Your Data</h2>
          <p>
            You own your data. We store it to operate the Service. You can export or delete it by contacting us. See the <Link href="/privacy" className="text-accent underline-offset-4 hover:underline">Privacy Policy</Link> for details.
          </p>

          <h2>Third-Party Integrations</h2>
          <p>
            When you connect QuickBooks, a calendar provider, or any other integration, you authorize GigWright to access data from that service on your behalf, subject to that service&rsquo;s own terms. You can disconnect integrations at any time.
          </p>

          <h2>Availability</h2>
          <p>
            We work hard to keep GigWright available, but we don&rsquo;t guarantee uninterrupted service. We may perform maintenance, and occasional downtime may happen. We&rsquo;ll do our best to communicate in advance.
          </p>

          <h2>Disclaimers</h2>
          <p>
            GigWright is provided &ldquo;as is&rdquo; without warranties of any kind, express or implied. To the fullest extent permitted by law, Patrick Lamb Productions is not liable for indirect, incidental, consequential, or special damages, or for lost profits or revenue, arising from your use of the Service.
          </p>

          <h2>Changes to These Terms</h2>
          <p>
            We may update these Terms. We&rsquo;ll post updates here with a new effective date and notify you for material changes. Continued use after changes constitutes acceptance.
          </p>

          <h2>Contact</h2>
          <p>
            Questions? Email <a href="mailto:patrick@patricklamb.com" className="text-accent underline-offset-4 hover:underline">patrick@patricklamb.com</a> or <a href="mailto:hello@gigwright.com" className="text-accent underline-offset-4 hover:underline">hello@gigwright.com</a>.
          </p>
        </div>
      </main>

      <footer className="border-t border-line bg-paper-warm py-10">
        <div className="mx-auto max-w-[1240px] px-8 text-center text-[12px] text-ink-mute">
          © 2026 GigWright · <Link href="/privacy" className="hover:text-ink">Privacy</Link> · <Link href="/terms" className="hover:text-ink">Terms</Link>
        </div>
      </footer>
    </div>
  );
}
