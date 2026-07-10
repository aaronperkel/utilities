import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, createSessionToken, sessionCookieOptions } from "@/lib/session";

// CAS callback: validate the ticket with serviceValidate and start a session.
export async function GET(req: NextRequest) {
  const ticket = req.nextUrl.searchParams.get("ticket");
  const next = req.nextUrl.searchParams.get("next") ?? "/";
  const safeNext = next.startsWith("/") ? next : "/";

  if (!ticket) {
    return new NextResponse("Missing CAS ticket.", { status: 400 });
  }

  const casBase = (process.env.CAS_BASE_URL ?? "https://login.uvm.edu/cas").replace(/\/+$/, "");
  const appBase = (process.env.APP_BASE_URL ?? req.nextUrl.origin).replace(/\/+$/, "");
  // Must match the service URL used at /login exactly
  const service = `${appBase}/api/auth/callback?next=${encodeURIComponent(safeNext)}`;

  const validateUrl = new URL(`${casBase}/serviceValidate`);
  validateUrl.searchParams.set("service", service);
  validateUrl.searchParams.set("ticket", ticket);

  const casRes = await fetch(validateUrl, { cache: "no-store" });
  const xml = await casRes.text();

  const match = xml.match(/<cas:user>([^<]+)<\/cas:user>/);
  if (!match) {
    console.error("CAS validation failed:", xml.slice(0, 500));
    return new NextResponse("CAS authentication failed.", { status: 401 });
  }
  const uid = match[1].trim().toLowerCase();

  const res = NextResponse.redirect(new URL(safeNext, req.url));
  res.cookies.set(SESSION_COOKIE, await createSessionToken(uid), sessionCookieOptions());
  return res;
}
