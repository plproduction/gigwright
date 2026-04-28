import Link from "next/link";

// Public SMS consent / opt-in policy page. Required by carrier compliance
// (TCR / 10DLC) so reviewers can verify the consent collection flow without
// signing into the application. Linked from the Privacy Policy and from
// the campaign registration message_flow field.

export const metadata = {
  title: "SMS Consent & Opt-In · GigWright",
  description:
    "How musicians consent to receive SMS gig updates through GigWright, including opt-in, opt-out, message frequency, and data-rate disclosures.",
};

export default function SmsConsentPage() {
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
          SMS Policy
        </div>
        <h1 className="mb-3 font-serif text-[44px] font-light leading-tight tracking-tight">
          SMS Consent &amp; Opt-In
        </h1>
        <p className="mb-12 text-[13px] text-ink-mute">Effective Date: April 28, 2026</p>

        <Prose>
          <p>
            GigWright is a B2B SaaS platform used by professional bandleaders and band managers (each a &ldquo;Bandleader&rdquo;) to coordinate live-music engagements with the musicians on their roster. This page describes, in full, how musicians consent to receive SMS messages from GigWright on behalf of a Bandleader.
          </p>

          <H2>Who sends, who receives</H2>
          <ul>
            <li><strong>Sender of record:</strong> Patrick Lamb Productions, operating GigWright at gigwright.com.</li>
            <li><strong>Initiating party:</strong> the Bandleader (the GigWright account holder) who has booked the gig.</li>
            <li><strong>Recipient:</strong> a musician (typically an independent contractor, sometimes a salaried sideperson) whom the Bandleader has hired to perform the gig.</li>
          </ul>

          <H2>How consent is collected</H2>
          <p>
            Musicians do <strong>not</strong> opt in through a public sign-up form on this website. Consent is collected <strong>offline</strong>, prior to a musician&rsquo;s phone number being entered into GigWright, as part of the ordinary contractor-onboarding conversation between Bandleader and musician.
          </p>
          <p>
            The flow, end to end:
          </p>
          <ol className="list-decimal pl-5 space-y-2">
            <li>
              <strong>Pre-existing relationship.</strong> The Bandleader has already engaged the musician for the gig (verbally, by email, by contract, or via a long-standing working relationship). A pre-existing professional relationship is a precondition.
            </li>
            <li>
              <strong>Verbal or written ask.</strong> As part of the same conversation in which the Bandleader collects the musician&rsquo;s name, email, mailing address, and W-9 information, the Bandleader explicitly asks the musician for permission to send gig-coordination text messages to the musician&rsquo;s mobile phone. Sample script: <em>&ldquo;Cool, can I text you details about the gig &mdash; call time, address, attire, any changes? Say no if you&rsquo;d rather just get the email.&rdquo;</em>
            </li>
            <li>
              <strong>Affirmative consent.</strong> The musician verbally agrees, replies &ldquo;yes&rdquo; in email, or signs a contractor agreement that includes an SMS-permission line. If the musician declines, the Bandleader does not enter the phone number, or enters it and immediately disables SMS for that musician (see step 5).
            </li>
            <li>
              <strong>Roster entry.</strong> The Bandleader signs into GigWright at <a href="https://gigwright.com" className="text-accent underline-offset-4 hover:underline">gigwright.com</a> and adds the musician to their private roster, including the phone number the musician provided.
            </li>
            <li>
              <strong>Per-musician toggle.</strong> Each musician row in the Bandleader&rsquo;s admin UI shows a <strong>&ldquo;Notify by SMS&rdquo;</strong> checkbox. It defaults to ON. The Bandleader can toggle it OFF at any time, for any musician, with a single click, and that musician will immediately stop receiving SMS from GigWright. By saving the row with the toggle ON, the Bandleader attests &mdash; under the GigWright Terms of Service &mdash; that the musician has provided permission to receive operational SMS about gigs they are scheduled to perform.
            </li>
            <li>
              <strong>Recipient-side opt-out.</strong> Independent of the Bandleader&rsquo;s toggle, the musician can opt out at any time by replying <strong>STOP</strong>, <strong>UNSUBSCRIBE</strong>, <strong>CANCEL</strong>, <strong>QUIT</strong>, or <strong>END</strong> to any GigWright SMS. Opt-out is processed by the carrier (Twilio Advanced Opt-Out) and is immediate and persistent.
            </li>
          </ol>

          <H2>What musicians receive</H2>
          <p>
            Messages are operational only. They contain information about a specific gig the musician is scheduled to perform, or changes to that information:
          </p>
          <ul>
            <li>Date, venue name, venue address (with map link)</li>
            <li>Load-in, soundcheck, call time, downbeat, end time</li>
            <li>Attire, meal, sound engineer contact, set list link</li>
            <li>The musician&rsquo;s pay for the gig and W-9 status</li>
            <li>Notifications when any of the above change (e.g. &ldquo;Call time moved to 7pm&rdquo;)</li>
          </ul>
          <p>
            <strong>No marketing.</strong> No promotional content. No third-party offers. No upsells.
          </p>

          <H2>Sample messages</H2>
          <Sample>
            Patrick Lamb sent gig info{"\n"}
            St. Ignatius Catholic Church &middot; Sun, Dec 7 &middot; 3:00 PM{"\n"}
            Full sheet: https://gigwright.com/g/abc123{"\n"}
            Reply STOP to opt out.
          </Sample>
          <Sample>
            Patrick Lamb: Call time changed{"\n"}
            The Triple Door &middot; Sat, Jan 17 &middot; doors 7:30, downbeat 8:30{"\n"}
            Full sheet: https://gigwright.com/g/xyz789{"\n"}
            Reply STOP to opt out.
          </Sample>
          <Sample>
            Patrick Lamb: Set list updated{"\n"}
            Neumos &middot; Fri, Mar 6 &middot; 9:00 PM{"\n"}
            Open: https://gigwright.com/g/def456{"\n"}
            Reply STOP to opt out.
          </Sample>

          <H2>Message frequency</H2>
          <p>
            Frequency varies with the Bandleader&rsquo;s gig schedule. A typical musician on a typical roster receives:
          </p>
          <ul>
            <li>0&ndash;10 messages per gig (initial info plus any updates)</li>
            <li>1&ndash;20 messages total per month</li>
          </ul>
          <p>
            High-tempo touring rosters may see more; quiet months may see none.
          </p>

          <H2>Message and data rates</H2>
          <p>
            <strong>Message and data rates may apply.</strong> Standard carrier rates from the recipient&rsquo;s wireless plan apply. GigWright does not charge musicians to receive SMS.
          </p>

          <H2>Privacy</H2>
          <p>
            Mobile phone numbers entered into GigWright are used <strong>exclusively</strong> to deliver the operational gig-coordination messages described above. We do not sell, rent, or share mobile numbers with third parties for marketing or promotional purposes. Mobile opt-in data and consent are not shared with any third party.
          </p>
          <p>
            Phone numbers are stored encrypted at rest in our database (Neon, US&dash;East&dash;1) and are accessible only to the Bandleader who entered them and to GigWright operators acting under signed data-processing agreements with our service providers.
          </p>
          <p>
            For full details, see our <Link href="/privacy" className="text-accent underline-offset-4 hover:underline">Privacy Policy</Link>.
          </p>

          <H2>Helpline keywords</H2>
          <ul>
            <li><strong>HELP</strong> &mdash; replies with the Bandleader&rsquo;s contact info and a link to GigWright support.</li>
            <li><strong>STOP</strong>, <strong>UNSUBSCRIBE</strong>, <strong>CANCEL</strong>, <strong>QUIT</strong>, <strong>END</strong> &mdash; immediately opts the recipient out of SMS for that Bandleader&rsquo;s campaign. Twilio&rsquo;s carrier-level Advanced Opt-Out is enabled, so opt-out is persistent across all future GigWright sends to that number.</li>
            <li><strong>START</strong>, <strong>UNSTOP</strong> &mdash; reverses a prior STOP and resumes sending.</li>
          </ul>

          <H2>Where to ask questions</H2>
          <p>
            <strong>Patrick Lamb Productions / GigWright</strong>
            <br />
            Email: <a href="mailto:patrick@patricklamb.com" className="text-accent underline-offset-4 hover:underline">patrick@patricklamb.com</a> or <a href="mailto:hello@gigwright.com" className="text-accent underline-offset-4 hover:underline">hello@gigwright.com</a>
          </p>
          <p>
            See also: <Link href="/privacy" className="text-accent underline-offset-4 hover:underline">Privacy Policy</Link> &middot; <Link href="/terms" className="text-accent underline-offset-4 hover:underline">Terms of Service</Link>
          </p>
        </Prose>
      </main>

      <footer className="border-t border-line bg-paper-warm py-10">
        <div className="mx-auto max-w-[1240px] px-8 text-center text-[12px] text-ink-mute">
          © 2026 GigWright · <Link href="/privacy" className="hover:text-ink">Privacy</Link> · <Link href="/terms" className="hover:text-ink">Terms</Link> · <Link href="/sms-consent" className="hover:text-ink">SMS Consent</Link>
        </div>
      </footer>
    </div>
  );
}

function Prose({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-5 text-[15px] leading-[1.7] text-ink-soft [&_h2]:mb-3 [&_h2]:mt-10 [&_h2]:font-serif [&_h2]:text-[22px] [&_h2]:font-normal [&_h2]:tracking-tight [&_h2]:text-ink [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-2 [&_strong]:font-semibold [&_strong]:text-ink">
      {children}
    </div>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2>{children}</h2>;
}

function Sample({ children }: { children: React.ReactNode }) {
  return (
    <pre className="my-3 whitespace-pre-wrap rounded-md border border-line bg-paper-warm px-4 py-3 font-mono text-[13px] leading-[1.55] text-ink">
      {children}
    </pre>
  );
}
