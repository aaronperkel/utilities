import { head } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentPerson } from "@/lib/auth";

// Auth-gated file serving for bill PDFs (bills.pdf_path, "2026/Gas/0623.pdf")
// and apartment documents (documents.file_path, "documents/lease-x1y2.pdf").
// Both map to /files/<key> and are streamed from Vercel Blob (the blob key
// equals the stored path), so the underlying blob URL is never exposed.

// An allowlist, not a lookup table: anything absent 404s, which keeps this
// route from becoming a general-purpose blob proxy. image/svg+xml is excluded
// on purpose — SVGs can execute script when served inline.
const SERVABLE_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".heic": "image/heic",
  ".heif": "image/heif",
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const person = await getCurrentPerson();
  if (!person) return new NextResponse("Forbidden", { status: 403 });

  const { path: parts } = await params;
  const filePath = parts.map(decodeURIComponent).join("/");
  const dot = filePath.lastIndexOf(".");
  const contentType = dot === -1 ? undefined : SERVABLE_TYPES[filePath.slice(dot).toLowerCase()];
  if (!contentType) {
    return new NextResponse("Not found", { status: 404 });
  }

  try {
    const blob = await head(filePath);
    const upstream = await fetch(blob.url);
    if (!upstream.ok || !upstream.body) {
      return new NextResponse("Not found", { status: 404 });
    }
    return new NextResponse(upstream.body, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${filePath.split("/").pop()}"`,
        "Cache-Control": "private, max-age=3600",
        // The route now serves user-uploaded image bytes; never let a browser
        // sniff its way to a different (scriptable) type.
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    // head() throws BlobNotFoundError for unknown keys
    return new NextResponse("Not found", { status: 404 });
  }
}
