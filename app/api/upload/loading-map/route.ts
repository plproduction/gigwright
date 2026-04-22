import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { updateGigField } from "@/lib/actions/gigs";

// Direct browser-to-Blob uploads for the per-gig loading map image.
// Pattern mirrors /api/upload/setlist — same sign-token-then-stream flow,
// but restricted to images and written to gig.loadingMapUrl.
export async function POST(req: Request): Promise<NextResponse> {
  const user = await requireUser();
  const body = (await req.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
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
        await updateGigField(gigId, "loadingMapUrl", blob.url);
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
