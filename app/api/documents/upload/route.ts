import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminAction } from "@/lib/auth";
import {
  ALLOWED_DOCUMENT_TYPES,
  MAX_DOCUMENT_BYTES,
  isDocumentPath,
} from "@/lib/documents";

/**
 * Token handshake for client-direct document uploads. The browser sends the
 * file straight to Vercel Blob, so nothing here is bounded by the 4.5MB
 * serverless request-body cap that limits the bill-PDF server action.
 *
 * This route is excluded from middleware (see middleware.ts) because the
 * upload-completed callback arrives from Vercel's servers with no session
 * cookie. Auth is not weakened: onBeforeGenerateToken gates the browser side,
 * and handleUpload verifies Vercel's signature on the callback.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        // Throws for non-admins; handleUpload surfaces it as a rejected upload.
        await requireAdminAction();

        // Without this the client could name any key and overwrite a bill PDF.
        if (!isDocumentPath(pathname)) {
          throw new Error("Documents must be uploaded under the documents/ prefix.");
        }

        return {
          allowedContentTypes: [...ALLOWED_DOCUMENT_TYPES],
          maximumSizeInBytes: MAX_DOCUMENT_BYTES,
          // Unlike bills, document keys are not deterministic — two files named
          // policy.pdf must coexist rather than clobber each other.
          addRandomSuffix: true,
        };
      },
      onUploadCompleted: async () => {
        // Intentionally empty: this callback never fires against localhost, so
        // the documents row is inserted by addDocument() once upload() resolves.
      },
    });
    return NextResponse.json(json);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed.";
    const status = /admin access required/i.test(message) ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
