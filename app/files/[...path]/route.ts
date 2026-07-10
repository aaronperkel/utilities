import { head } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentPerson } from "@/lib/auth";

// Auth-gated bill PDF serving. bills.pdf_path values like "2026/Gas/0623.pdf"
// map to /files/2026/Gas/0623.pdf and are streamed from Vercel Blob (the blob
// key equals pdf_path), so the underlying blob URL is never exposed.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const person = await getCurrentPerson();
  if (!person) return new NextResponse("Forbidden", { status: 403 });

  const { path: parts } = await params;
  const pdfPath = parts.map(decodeURIComponent).join("/");
  if (!pdfPath.toLowerCase().endsWith(".pdf")) {
    return new NextResponse("Not found", { status: 404 });
  }

  try {
    const blob = await head(pdfPath);
    const upstream = await fetch(blob.url);
    if (!upstream.ok || !upstream.body) {
      return new NextResponse("Not found", { status: 404 });
    }
    return new NextResponse(upstream.body, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${pdfPath.split("/").pop()}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    // head() throws BlobNotFoundError for unknown keys
    return new NextResponse("Not found", { status: 404 });
  }
}
