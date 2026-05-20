import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/lib/db";

// Direct browser-to-Blob uploads for the per-gig stage plot. Pattern
// mirrors /api/upload/loading-map exactly — see that file's comment for the
// full story on the two-context split (browser cookies vs. Blob webhook).
// Same disappearing-after-edit defense applies: the saveStagePlotUploaded
// server action called from the client AFTER upload() is the primary
// commit; this onUploadCompleted handler stays as an idempotent backup.
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
        if (!gigId) throw new Error("Missing gigId");

        const gig = await db.gig.findFirst({
          where: { id: gigId, ownerId: user.id },
        });
        if (!gig) throw new Error("Gig not found");

        return {
          allowedContentTypes: [
            "image/png",
            "image/jpeg",
            "image/webp",
            "image/heic",
            "image/heif",
            "application/pdf",
          ],
          // Stage plots are usually a one- to two-page PDF or a single
          // photo of a hand-drawn layout — 10 MB is plenty.
          maximumSizeInBytes: 10 * 1024 * 1024,
          tokenPayload: JSON.stringify({ gigId, userId: user.id }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // Backup write path — primary commit is the saveStagePlotUploaded
        // server action called from the client after upload(). Idempotent.
        const payload = tokenPayload ? JSON.parse(tokenPayload) : {};
        const gigId = payload.gigId as string | undefined;
        if (!gigId) return;

        const existing = await db.gig.findUnique({
          where: { id: gigId },
          select: { stagePlotUrl: true },
        });
        if (existing?.stagePlotUrl === blob.url) return;

        await db.gig.update({
          where: { id: gigId },
          data: { stagePlotUrl: blob.url },
        });
        await db.activity.create({
          data: {
            gigId,
            action: "field_updated:stagePlotUrl",
            summary: "Stage plot uploaded",
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
