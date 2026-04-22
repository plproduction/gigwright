import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { updateGigField } from "@/lib/actions/gigs";

// Direct browser-to-Blob uploads. The client calls upload() from
// @vercel/blob/client, which hits this route to get a signed upload token,
// then streams the file straight to Vercel Blob — never through our server.
// On upload completion, Blob calls this route again with the final URL, and
// we write it to the gig's setlistUrl / setlistFileName fields.
export async function POST(req: Request): Promise<NextResponse> {
  const user = await requireUser();
  const body = (await req.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        // clientPayload is a JSON string from the browser — we put the gigId there
        const payload = clientPayload ? JSON.parse(clientPayload) : {};
        const gigId = payload.gigId as string | undefined;
        if (!gigId) throw new Error("Missing gigId");

        // Verify the gig belongs to this user before letting them upload
        const gig = await db.gig.findFirst({
          where: { id: gigId, ownerId: user.id },
        });
        if (!gig) throw new Error("Gig not found");

        return {
          allowedContentTypes: ["application/pdf"],
          maximumSizeInBytes: 20 * 1024 * 1024, // 20 MB — plenty for a set list
          tokenPayload: JSON.stringify({ gigId, userId: user.id }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // Blob is now stored; write the URL + original filename to the gig.
        const payload = tokenPayload ? JSON.parse(tokenPayload) : {};
        const gigId = payload.gigId as string | undefined;
        if (!gigId) return;

        // Strip the upload folder prefix from the display name
        const fileName =
          blob.pathname.split("/").pop()?.replace(/\.pdf$/i, ".pdf") ??
          "setlist.pdf";

        await updateGigField(gigId, "setlistUrl", blob.url);
        await updateGigField(gigId, "setlistFileName", fileName);
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
