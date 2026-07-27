"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { extractContractFromUrl } from "@/lib/extract-contract";
import type { ExtractedContract } from "@/lib/extract-contract";
import {
  matchVenue,
  matchProducer,
  type VenueMatch,
  type ProducerMatch,
} from "@/lib/venue-producer-match";

// Fire the Claude extraction against a Vercel Blob URL and return the
// extracted fields together with venue/producer match plans. Called
// after the client has finished uploading the PDF; the review page
// consumes the result to render editable fields with match hints.
export async function extractContractAction(
  blobUrl: string,
): Promise<
  | {
      ok: true;
      extracted: ExtractedContract;
      venueMatch: VenueMatch;
      producerMatch: ProducerMatch;
    }
  | { ok: false; error: string }
> {
  const user = await requireUser();
  const result = await extractContractFromUrl(blobUrl);
  if (!result.ok) return result;

  const [venueMatch, producerMatch] = await Promise.all([
    matchVenue(user.id, result.data.venue),
    matchProducer(user.id, result.data.producer),
  ]);
  return {
    ok: true,
    extracted: result.data,
    venueMatch,
    producerMatch,
  };
}

// ————————————————————————————————————————————————————————————————
// Save action — creates the Gig, and creates/links Venue + Producer
// as needed. Called when Patrick clicks "Save gig" on the review page.
// ————————————————————————————————————————————————————————————————

export type CreateFromContractInput = {
  // Contract PDF (already in Vercel Blob).
  contractUrl: string;
  contractFileName: string;
  // Venue: either use an existing row (venueId) or create new (venueNew).
  venueId?: string;
  venueNew?: {
    name: string;
    addressL1: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
  };
  // Producer: existing row, new row, or no producer at all.
  producerId?: string;
  producerNew?: {
    name: string;
    email: string | null;
    phone: string | null;
    company: string | null;
  };
  // Event date + times, from Patrick's review-edited values.
  // date is "YYYY-MM-DD"; times are "HH:MM" local wall-clock.
  date: string;
  loadInTime: string | null;
  downbeatTime: string | null;
  endTime: string | null;
  // Freeform notes — usually starts empty; the review page dumps
  // Claude's unrecognizedFields here as a pre-populated suggestion.
  notes: string | null;
};

// Combine a "YYYY-MM-DD" date and an "HH:MM" time into a local-time
// Date object. If time is null, returns null. If time is present but
// invalid, returns null (defensive; the review UI should have
// prevented this).
function combineDateTime(date: string, time: string | null): Date | null {
  if (!time) return null;
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  if ([y, m, d, hh, mm].some((n) => Number.isNaN(n))) return null;
  return new Date(y, m - 1, d, hh, mm);
}

export async function createGigFromContractAction(
  input: CreateFromContractInput,
): Promise<{ ok: true; gigId: string } | { ok: false; error: string }> {
  const user = await requireUser();

  // Resolve venue.
  let venueId: string | undefined = input.venueId;
  if (!venueId && input.venueNew) {
    // Verify the extracted venue name hasn't been created since the
    // extraction ran (tab left open for a while, then saved) — very
    // low probability, but a duplicate here is exactly what the whole
    // matcher exists to prevent.
    const dupe = await db.venue.findFirst({
      where: {
        ownerId: user.id,
        name: input.venueNew.name,
      },
      select: { id: true },
    });
    if (dupe) {
      venueId = dupe.id;
    } else {
      const created = await db.venue.create({
        data: {
          ownerId: user.id,
          name: input.venueNew.name,
          addressL1: input.venueNew.addressL1,
          city: input.venueNew.city,
          state: input.venueNew.state,
          postalCode: input.venueNew.postalCode,
        },
      });
      venueId = created.id;
    }
  }
  if (!venueId) {
    return { ok: false, error: "Venue is required." };
  }

  // Resolve producer (optional).
  let producerId: string | undefined = input.producerId;
  if (!producerId && input.producerNew) {
    // Same dedup guard as venue — the matcher runs at extraction time,
    // but Patrick may leave the review page open.
    const dupe = input.producerNew.email
      ? await db.producer.findFirst({
          where: {
            ownerId: user.id,
            email: input.producerNew.email,
          },
          select: { id: true },
        })
      : null;
    if (dupe) {
      producerId = dupe.id;
    } else {
      const created = await db.producer.create({
        data: {
          ownerId: user.id,
          name: input.producerNew.name,
          email: input.producerNew.email,
          phone: input.producerNew.phone,
          company: input.producerNew.company,
        },
      });
      producerId = created.id;
    }
  }

  // Combine date + times.
  const startAt =
    combineDateTime(input.date, input.downbeatTime) ??
    combineDateTime(input.date, "20:00")!; // sensible default: 8pm

  const loadInAt = combineDateTime(input.date, input.loadInTime);
  const endAt = combineDateTime(input.date, input.endTime);

  // Copy the leader-personnel behavior from the manual New Gig flow so
  // extracted gigs land in the same shape (leader on the roster).
  const leader = await db.musician.findFirst({
    where: { ownerId: user.id, isLeader: true },
    select: { id: true },
  });

  const created = await db.gig.create({
    data: {
      ownerId: user.id,
      venueId,
      producerId,
      startAt,
      loadInAt,
      endAt,
      contractUrl: input.contractUrl,
      contractFileName: input.contractFileName,
      notes: input.notes,
      personnel: leader
        ? { create: [{ musicianId: leader.id, payCents: 0, position: 0 }] }
        : undefined,
    },
  });

  await db.activity.create({
    data: {
      gigId: created.id,
      action: "gig_created",
      summary: "Gig created from contract",
    },
  });

  revalidatePath("/my-gigs");
  revalidatePath("/dashboard");
  return { ok: true, gigId: created.id };
}
