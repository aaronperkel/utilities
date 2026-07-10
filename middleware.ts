import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

// Everything requires a session except the public surfaces (calendar feed,
// unpaid API, auth flow, static assets — excluded via the matcher below).
export async function middleware(req: NextRequest) {
  // Local dev: APP_LOCAL_DEV_USER mocks CAS entirely
  if (process.env.APP_LOCAL_DEV_USER) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token && (await verifySessionToken(token))) return NextResponse.next();

  if (req.method !== "GET") {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const login = new URL("/api/auth/login", req.url);
  login.searchParams.set("next", req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    "/((?!_next/|api/auth/|api/unpaid|cal.ics|no-access|favicon|apple-touch-icon|site.webmanifest|web-app-manifest).*)",
  ],
};
