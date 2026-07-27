import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";

// Pre-gig contract upload — used by the "New gig from contract" flow.
// Unlike /api/upload/contract, there is no gigId yet: the whole point
// is that we're about to CREATE a gig from what Claude reads. So this
// endpoint only checks that the caller is authenticated (bandleader
// with a valid session).
//
// The uploaded PDF lands in Vercel Blob under a staging prefix. The
// eventual gig-creation server action moves it to the gig by simply
// storing the same URL in Gig.contractUrl — Vercel Blob is content-
// addressed, so a "move" is a no-op (the URL already works). No
// webhook DB write here, because there's no gig row to attach to yet.
export async function POST(req: Request): Promise<NextResponse> {
  const body = (await req.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => {
        const session = await auth();
        const email = session?.user?.email;
        if (!email) throw new Error("Not authenticated");
        const user = await db.user.findUnique({ where: { email } });
        if (!user) throw new Error("Not authenticated");
        return {
          allowedContentTypes: [
            "application/pdf",
            "image/jpeg",
            "image/png",
            "image/heic",
            "image/heif",
          ],
          maximumSizeInBytes: 25 * 1024 * 1024,
          tokenPayload: JSON.stringify({ userId: user.id }),
        };
      },
      onUploadCompleted: async () => {
        // No-op — the gig-creation server action will persist the URL
        // to the new gig's contractUrl field once Patrick clicks Save.
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
