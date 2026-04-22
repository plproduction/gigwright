import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";

// Avatar (headshot) upload for roster musicians. Same direct-to-Blob pattern
// as the set list upload: browser → Blob, server only signs the token after
// verifying the musician belongs to this user.
export async function POST(req: Request): Promise<NextResponse> {
  const user = await requireUser();
  const body = (await req.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        const payload = clientPayload ? JSON.parse(clientPayload) : {};
        const musicianId = payload.musicianId as string | undefined;
        if (!musicianId) throw new Error("Missing musicianId");
        const musician = await db.musician.findFirst({
          where: { id: musicianId, ownerId: user.id },
        });
        if (!musician) throw new Error("Musician not found");
        return {
          // Accept any common image type — iPhone default is HEIC, Android JPEG,
          // screenshots are PNG. Browsers render all three as <img>.
          allowedContentTypes: [
            "image/jpeg",
            "image/png",
            "image/heic",
            "image/heif",
            "image/webp",
          ],
          maximumSizeInBytes: 10 * 1024 * 1024, // 10 MB
          tokenPayload: JSON.stringify({ musicianId, userId: user.id }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const payload = tokenPayload ? JSON.parse(tokenPayload) : {};
        const musicianId = payload.musicianId as string | undefined;
        if (!musicianId) return;
        await db.musician.update({
          where: { id: musicianId },
          data: { avatarUrl: blob.url },
        });
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
