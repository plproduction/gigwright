import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/lib/db";

// Contract upload — same two-context handleUpload pattern as the set
// list route. Auth in the token-generation half only; the completion
// webhook (server-to-server from Vercel Blob, no cookies) writes the
// URL to the gig record it was already authorized against via the
// signed tokenPayload.
//
// One key difference from setlist: contracts are BANDLEADER-ONLY, so
// there's no plan gate (free plan can store their client contracts
// too — hiding this behind Pro would defeat the "one place I don't
// have to hunt for it" purpose) and never fires an Activity row that
// implies the band will see anything.
export async function POST(req: Request): Promise<NextResponse> {
  const body = (await req.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        const session = await auth();
        const email = session?.user?.email;
        if (!email) throw new Error("Not authenticated");
        const user = await db.user.findUnique({ where: { email } });
        if (!user) throw new Error("Not authenticated");

        const payload = clientPayload ? JSON.parse(clientPayload) : {};
        const gigId = payload.gigId as string | undefined;
        const originalFileName = payload.fileName as string | undefined;
        if (!gigId) throw new Error("Missing gigId");

        const gig = await db.gig.findFirst({
          where: { id: gigId, ownerId: user.id },
        });
        if (!gig) throw new Error("Gig not found");

        return {
          // Contracts are almost always PDFs from DocuSign / Adobe /
          // scanned paper. Accept PDF plus common image formats in case
          // the bandleader has a photo of a signed sheet.
          allowedContentTypes: [
            "application/pdf",
            "image/jpeg",
            "image/png",
            "image/heic",
            "image/heif",
          ],
          maximumSizeInBytes: 25 * 1024 * 1024, // 25 MB
          tokenPayload: JSON.stringify({
            gigId,
            userId: user.id,
            originalFileName,
          }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // Backup write path — same idempotency check as setlist.
        const payload = tokenPayload ? JSON.parse(tokenPayload) : {};
        const gigId = payload.gigId as string | undefined;
        const originalFileName = payload.originalFileName as
          | string
          | undefined;
        if (!gigId) return;

        const existing = await db.gig.findUnique({
          where: { id: gigId },
          select: { contractUrl: true },
        });
        if (existing?.contractUrl === blob.url) return;

        const fileName =
          originalFileName ??
          blob.pathname.split("/").pop()?.replace(/^\d+-/, "") ??
          "contract.pdf";

        await db.gig.update({
          where: { id: gigId },
          data: {
            contractUrl: blob.url,
            contractFileName: fileName,
          },
        });
        // Deliberately NOT logging to Activity — the bandleader's
        // paperwork is not something the band's activity feed needs to
        // see. Revalidate the bandleader-only surfaces only.
        revalidatePath(`/gigs/${gigId}`);
        revalidatePath(`/gigs/${gigId}/edit`);
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
