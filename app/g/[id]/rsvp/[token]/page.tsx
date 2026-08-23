import { db } from "@/lib/db";
import { notifyBandleaderOfRsvp } from "@/lib/notify-rsvp";

// Public accept/decline landing page for gig invites. No auth required —
// the unguessable inviteToken IS the authentication. Musicians land
// here from the Accept/Decline buttons in the invite email:
//
//   /g/[gigId]/rsvp/[token]?answer=yes  → confirms acceptance
//   /g/[gigId]/rsvp/[token]?answer=no   → confirms decline
//
// Design decisions (Patrick 2026-08-06):
//   - No unassignment on decline. Bandleader sees the ✗ chip and
//     decides whether to grovel or backfill.
//   - Musician can flip their answer freely (Accept → Decline or
//     vice versa) — clicking a different link updates the response.
//   - Links expire when the gig date passes (accepting a wedding at
//     3am the morning after is useless and misleading).
//   - Fresh token generated on every send, so an old email's link
//     stops working after a resend.

// Force dynamic — this route reads the DB on every hit; we do not
// want Next's build-time or ISR caching to serve stale RSVP pages.
export const dynamic = "force-dynamic";

type Params = { id: string; token: string };
type SearchParams = { answer?: string };

export default async function RsvpPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<SearchParams>;
}) {
  const { id: gigId, token } = await params;
  const { answer } = await searchParams;

  const personnel = await db.gigPersonnel.findFirst({
    where: { inviteToken: token, gigId },
    include: {
      musician: { select: { name: true } },
      gig: {
        include: { venue: { select: { name: true } } },
      },
    },
  });

  if (!personnel) {
    return <RsvpMessage tone="bad" title="Link expired or invalid" body="This RSVP link either expired (the bandleader resent the invite, replacing this link) or was mistyped. Ask the bandleader to send a fresh invite." />;
  }

  const gigPast = personnel.gig.startAt.getTime() < Date.now();
  if (gigPast) {
    return <RsvpMessage tone="neutral" title="This gig has already happened" body={`The ${personnel.gig.startAt.toLocaleDateString()} gig at ${personnel.gig.venue?.name ?? "TBD"} has already passed. If you need to update your status, reach out to the bandleader directly.`} />;
  }

  // No answer param: just show the choice (rare — usually the email
  // links have ?answer=yes|no baked in).
  if (answer !== "yes" && answer !== "no") {
    return <RsvpChoice gigId={gigId} token={token} personnel={personnel} />;
  }

  const newResponse = answer === "yes" ? "accepted" : "declined";

  // Idempotent: if they're already at this response, don't rewrite.
  if (personnel.response === newResponse) {
    return (
      <RsvpMessage
        tone="good"
        title={newResponse === "accepted" ? "You're in" : "Decline recorded"}
        body={`Your ${newResponse === "accepted" ? "acceptance of" : "decline for"} the ${personnel.gig.startAt.toLocaleDateString()} gig is already on record. You don't need to click again.`}
      />
    );
  }

  await db.gigPersonnel.update({
    where: { id: personnel.id },
    data: {
      response: newResponse,
      respondedAt: new Date(),
    },
  });
  await db.activity.create({
    data: {
      gigId,
      action: newResponse === "accepted" ? "personnel_accepted" : "personnel_declined",
      summary: `${personnel.musician.name} ${newResponse} the gig`,
    },
  });
  // Fire-and-forget notification to the bandleader. Wrapped in a
  // helper that never throws, so a Resend hiccup can't prevent this
  // confirmation page from rendering. Patrick 2026-08-08.
  await notifyBandleaderOfRsvp(personnel.id);

  return (
    <RsvpMessage
      tone="good"
      title={newResponse === "accepted" ? "Thanks — you're in" : "Thanks — decline recorded"}
      body={
        newResponse === "accepted"
          ? `Your acceptance is on record. The bandleader will send you the full sheet as details come in. Put ${personnel.gig.startAt.toLocaleDateString()} on your calendar.`
          : `Your decline is on record. The bandleader has been notified. If your availability changes, get in touch directly.`
      }
    />
  );
}

// ————————————————————————————————————————————————————————————————
// UI helpers
// ————————————————————————————————————————————————————————————————

function RsvpChoice({
  gigId,
  token,
  personnel,
}: {
  gigId: string;
  token: string;
  personnel: {
    payCents: number;
    musician: { name: string };
    gig: {
      startAt: Date;
      venue: { name: string } | null;
      eventName: string | null;
    };
  };
}) {
  const gigDate = personnel.gig.startAt.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const venueName = personnel.gig.venue?.name ?? "TBD";
  const headline = personnel.gig.eventName
    ? `${personnel.gig.eventName} at ${venueName}`
    : venueName;

  return (
    <div className="min-h-screen bg-paper px-6 py-12">
      <div className="mx-auto max-w-md rounded-lg border border-line bg-white p-8 shadow-sm">
        <div className="border-b border-line pb-4">
          <div className="font-serif text-[20px] font-medium tracking-tight">
            Gig<em className="font-light text-accent">Wright</em>
          </div>
        </div>
        <h1 className="mt-6 font-serif text-[22px] font-normal">
          Hi {personnel.musician.name.split(" ")[0]},
        </h1>
        <p className="mt-3 text-[14px] leading-[1.55] text-ink-soft">
          Please respond to this gig invite:
        </p>
        <div className="mt-4 space-y-2 rounded-md border border-line bg-paper-warm/40 p-4 text-[14px]">
          <div>
            <span className="text-ink-mute">Date: </span>
            <strong>{gigDate}</strong>
          </div>
          <div>
            <span className="text-ink-mute">Location: </span>
            <strong>{headline}</strong>
          </div>
          <div>
            <span className="text-ink-mute">Pay: </span>
            <strong className="text-accent">
              ${(personnel.payCents / 100).toFixed(2)}
            </strong>
          </div>
        </div>
        <div className="mt-6 flex gap-3">
          <a
            href={`/g/${gigId}/rsvp/${token}?answer=yes`}
            className="flex-1 rounded-md bg-success px-6 py-3 text-center text-[15px] font-semibold text-white"
          >
            ✓ Accept
          </a>
          <a
            href={`/g/${gigId}/rsvp/${token}?answer=no`}
            className="flex-1 rounded-md bg-ink-mute px-6 py-3 text-center text-[15px] font-semibold text-white"
          >
            Decline
          </a>
        </div>
      </div>
    </div>
  );
}

function RsvpMessage({
  tone,
  title,
  body,
}: {
  tone: "good" | "bad" | "neutral";
  title: string;
  body: string;
}) {
  const accent =
    tone === "good"
      ? "border-success/40 bg-success/5"
      : tone === "bad"
        ? "border-accent/40 bg-accent/5"
        : "border-line bg-paper-warm/40";
  return (
    <div className="min-h-screen bg-paper px-6 py-12">
      <div className={`mx-auto max-w-md rounded-lg border p-8 shadow-sm ${accent}`}>
        <div className="border-b border-line pb-4">
          <div className="font-serif text-[20px] font-medium tracking-tight">
            Gig<em className="font-light text-accent">Wright</em>
          </div>
        </div>
        <h1 className="mt-6 font-serif text-[22px] font-normal">{title}</h1>
        <p className="mt-3 text-[14px] leading-[1.55] text-ink-soft">{body}</p>
      </div>
    </div>
  );
}
