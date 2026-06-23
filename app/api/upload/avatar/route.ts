import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";

// Avatar (headshot) upload for roster musicians. Same direct-to-Blob pattern
// as the set list upload: browser → Blob, server only signs the token after
// verifying the musician belongs to this user.
//
// This endpoint is hit TWICE for every upload:
//   1) The browser requests a client token (HandleUploadBody.type ===
//      "blob.generate-client-token"). The signed-in user's session cookie
//      is present; we check Musician ownership before signing.
//   2) Vercel Blob's servers hit it again as a webhook after the upload
//      completes (HandleUploadBody.type === "blob.upload-completed"). NO
//      session cookie — the call comes from Vercel's infra, not the
//      browser. Bouncing this to /signin is what was silently dropping
//      the DB write and making "uploaded photo but it didn't stick"
//      look like a save bug.
//
// So: auth gate only the token-generation half; let the webhook-completion
// half through and rely on the tokenPayload (which we signed earlier) to
// scope the write.
export async function POST(req: Request): Promise<NextResponse> {
  const body = (await req.json()) as HandleUploadBody;
  const isTokenRequest = body.type === "blob.generate-client-token";

  if (isTokenRequest) {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "not signed in" }, { status: 401 });
    }
  }

  // Resolve the user only when we're going to use them (token-gen path).
  // The webhook path doesn't need a user — it has the tokenPayload we
  // baked in during the token-gen step.
  const sessionUser = isTokenRequest
    ? await db.user.findUnique({
        where: { email: (await auth())?.user?.email ?? "" },
        select: { id: true },
      })
    : null;

  try {
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        const payload = clientPayload ? JSON.parse(clientPayload) : {};
        const musicianId = payload.musicianId as string | undefined;
        if (!musicianId) throw new Error("Missing musicianId");
        if (!sessionUser?.id) throw new Error("Not signed in");
        // Allow either the bandleader who owns this roster row OR the
        // musician themselves (linked via userId) to upload an avatar.
        // The old check was ownerId-only, which broke avatar uploads
        // from /my-profile — the signed-in user there is the musician,
        // not the bandleader, so ownerId == user.id never held.
        const musician = await db.musician.findFirst({
          where: {
            id: musicianId,
            OR: [{ ownerId: sessionUser.id }, { userId: sessionUser.id }],
          },
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
          tokenPayload: JSON.stringify({ musicianId, userId: sessionUser.id }),
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
