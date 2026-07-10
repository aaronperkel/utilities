import fs from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentPerson } from "@/lib/auth";

const BILLS_DIR = process.env.BILLS_DIR ?? path.join(process.cwd(), "bill-pdfs");

// Auth-gated bill PDF serving. fldView paths like "public/2026/Gas/0623.pdf"
// map to /files/2026/Gas/0623.pdf, read from BILLS_DIR (outside any public dir).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const person = await getCurrentPerson();
  if (!person) return new NextResponse("Forbidden", { status: 403 });

  const { path: parts } = await params;
  const resolved = path.resolve(BILLS_DIR, ...parts.map(decodeURIComponent));
  if (!resolved.startsWith(path.resolve(BILLS_DIR) + path.sep)) {
    return new NextResponse("Bad path", { status: 400 });
  }
  if (!resolved.toLowerCase().endsWith(".pdf")) {
    return new NextResponse("Not found", { status: 404 });
  }

  try {
    const data = await fs.readFile(resolved);
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${path.basename(resolved)}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
