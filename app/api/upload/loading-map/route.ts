import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/lib/db";

// Direct browser-to-Blob uploads for the per-gig loading map image.
// Pattern mirrors /api/upload/setlist — same two-context split:
//   - blob.generate-client-token  → from the BROWSER (cookies present)
//   - blob.upload-completed       → from VERCEL BLOB (no cookies)
// Auth therefore happens ONLY inside onBeforeGenerateToken; the
// completion webhook trusts the { gigId, userId } baked into tokenPayload.
// (See the long comment in app/api/upload/setlist/route.ts for the full
// story — same disappearing-after-edit bug applied to loading maps.)
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
          ],
          maximumSizeInBytes: 10 * 1024 * 1024, // 10 MB — plenty for a map screenshot
          tokenPayload: JSON.stringify({ gigId, userId: user.id }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const payload = tokenPayload ? JSON.parse(tokenPayload) : {};
        const gigId = payload.gigId as string | undefined;
        if (!gigId) return;

        await db.gig.update({
          where: { id: gigId },
          data: { loadingMapUrl: blob.url },
        });
        await db.activity.create({
          data: {
            gigId,
            action: "field_updated:loadingMapUrl",
            summary: "Loading map uploaded",
          },
        });
        // Bust caches everywhere this gig surfaces so the upload is
        // visible without a manual reload — same pattern as the
        // setlist webhook.
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
