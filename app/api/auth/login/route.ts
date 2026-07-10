import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, createSessionToken, sessionCookieOptions } from "@/lib/session";

// Entry point of the CAS login flow. With APP_LOCAL_DEV_USER set (local dev),
// it just mints a session for that NetID.
export async function GET(req: NextRequest) {
  const next = req.nextUrl.searchParams.get("next") ?? "/";
  const safeNext = next.startsWith("/") ? next : "/";

  const devUser = process.env.APP_LOCAL_DEV_USER;
  if (devUser) {
    const res = NextResponse.redirect(new URL(safeNext, req.url));
    res.cookies.set(SESSION_COOKIE, await createSessionToken(devUser), sessionCookieOptions());
    return res;
  }

  const casBase = (process.env.CAS_BASE_URL ?? "https://login.uvm.edu/cas").replace(/\/+$/, "");
  const appBase = (process.env.APP_BASE_URL ?? req.nextUrl.origin).replace(/\/+$/, "");
  const service = `${appBase}/api/auth/callback?next=${encodeURIComponent(safeNext)}`;

  const casLogin = new URL(`${casBase}/login`);
  casLogin.searchParams.set("service", service);
  return NextResponse.redirect(casLogin);
}
