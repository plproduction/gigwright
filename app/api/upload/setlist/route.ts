import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { isPaid } from "@/lib/plan";

// Direct browser-to-Blob uploads. The client calls upload() from
// @vercel/blob/client, which hits this route in TWO different contexts:
//
//   1. type=blob.generate-client-token — request from the user's BROWSER
//      to get a signed upload token. Cookies present, auth works normally.
//   2. type=blob.upload-completed — server-to-server webhook from Vercel
//      Blob after the file lands. NO cookies, NO session. We cannot call
//      requireUser() in this context — it would 302 to /signin and the
//      callback would never run, so the gig record would never get its
//      setlistUrl. (That was the "PDF disappears after editing something
//      else" bug.)
//
// Therefore: auth happens ONLY inside onBeforeGenerateToken, and the
// verified { gigId, userId } travels to the completion callback via
// tokenPayload. The DB write in onUploadCompleted runs unauthenticated
// but only writes to the gig that we already verified ownership of when
// minting the token.
export async function POST(req: Request): Promise<NextResponse> {
  const body = (await req.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        // Browser-side: authenticate the user and verify gig ownership
        // before letting them upload anything.
        const session = await auth();
        const email = session?.user?.email;
        if (!email) throw new Error("Not authenticated");
        const user = await db.user.findUnique({ where: { email } });
        if (!user) throw new Error("Not authenticated");

        // Set list PDF upload is a Pro feature. FREE users see the
        // SetlistUpload component disabled, but the API still enforces
        // the gate defensively.
        if (!isPaid(user.plan)) {
          throw new Error("Set list PDF upload is a Pro feature");
        }

        const payload = clientPayload ? JSON.parse(clientPayload) : {};
        const gigId = payload.gigId as string | undefined;
        const originalFileName = payload.fileName as string | undefined;
        if (!gigId) throw new Error("Missing gigId");

        const gig = await db.gig.findFirst({
          where: { id: gigId, ownerId: user.id },
        });
        if (!gig) throw new Error("Gig not found");

        return {
          allowedContentTypes: ["application/pdf"],
          maximumSizeInBytes: 20 * 1024 * 1024, // 20 MB — plenty for a set list
          tokenPayload: JSON.stringify({
            gigId,
            userId: user.id,
            originalFileName,
          }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // BACKUP write path. The primary commit happens via the
        // saveSetlistUploaded server action called from the client right
        // after upload() resolves — that's reliable in our Netlify-hosted
        // production. This webhook is the safety net: if the user's tab
        // closed between upload completion and the server action firing,
        // this still saves the URL.
        //
        // Idempotent: if the gig already has the same setlistUrl, skip.
        // Avoids creating a duplicate Activity log entry every time both
        // paths succeed (the common case).
        const payload = tokenPayload ? JSON.parse(tokenPayload) : {};
        const gigId = payload.gigId as string | undefined;
        const originalFileName = payload.originalFileName as
          | string
          | undefined;
        if (!gigId) return;

        const existing = await db.gig.findUnique({
          where: { id: gigId },
          select: { setlistUrl: true },
        });
        if (existing?.setlistUrl === blob.url) {
          // Server action already saved this exact URL — nothing to do.
          return;
        }

        const fileName =
          originalFileName ??
          blob.pathname.split("/").pop()?.replace(/^\d+-/, "") ??
          "setlist.pdf";

        await db.gig.update({
          where: { id: gigId },
          data: {
            setlistUrl: blob.url,
            setlistFileName: fileName,
            setlistUpdatedAt: new Date(),
          },
        });
        await db.activity.create({
          data: {
            gigId,
            action: "field_updated:setlistUrl",
            summary: "Set list updated — band will be notified on fanout",
          },
        });
        revalidatePath(`/gigs/${gigId}`);
        revalidatePath(`/gigs/${gigId}/edit`);
        revalidatePath(`/dashboard`);
        revalidatePath(`/finance`);
        revalidatePath(`/my-gigs`);
        revalidatePath(`/my-gigs/${gigId}`);
      },
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 400 },
    );
  }
}
