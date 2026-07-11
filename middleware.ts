import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  createSessionToken,
  readSessionToken,
  sessionCookieOptions,
} from "@/lib/session";

// Re-issue the 30-day session cookie once it's a week old, so anyone who
// visits at least monthly never sees the login page again.
const RENEW_AFTER_SECONDS = 7 * 24 * 60 * 60;

// Everything requires a session except the public surfaces (login page,
// calendar feed, unpaid API, static assets — excluded via the matcher below).
export async function middleware(req: NextRequest) {
  // Local dev: APP_LOCAL_DEV_USER bypasses login entirely
  if (process.env.APP_LOCAL_DEV_USER) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await readSessionToken(token) : null;
  if (session) {
    const res = NextResponse.next();
    const age = session.issuedAt ? Date.now() / 1000 - session.issuedAt : 0;
    if (age > RENEW_AFTER_SECONDS) {
      res.cookies.set(
        SESSION_COOKIE,
        await createSessionToken(session.uid),
        sessionCookieOptions(),
      );
    }
    return res;
  }

  if (req.method !== "GET") {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const login = new URL("/login", req.url);
  login.searchParams.set("next", req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    "/((?!_next/|login|api/unpaid|api/cron|cal.ics|no-access|favicon|apple-touch-icon|site.webmanifest|web-app-manifest|og.png).*)",
  ],
};
