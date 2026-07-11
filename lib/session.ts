import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "utilities_session";
const SESSION_DAYS = 30;

function secretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(uid: string): Promise<string> {
  return new SignJWT({ uid })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secretKey());
}

export interface SessionInfo {
  uid: string;
  issuedAt: number | null; // unix seconds, for sliding renewal
}

/** Verify a raw session JWT and return its claims. Edge-safe (used by middleware). */
export async function readSessionToken(token: string): Promise<SessionInfo | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (typeof payload.uid !== "string") return null;
    return {
      uid: payload.uid,
      issuedAt: typeof payload.iat === "number" ? payload.iat : null,
    };
  } catch {
    return null;
  }
}

/** Verify a raw session JWT; returns the uid or null. */
export async function verifySessionToken(token: string): Promise<string | null> {
  return (await readSessionToken(token))?.uid ?? null;
}

/** Current NetID from the session cookie, with the local-dev mock as fallback. */
export async function getSessionUid(): Promise<string | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    const uid = await verifySessionToken(token);
    if (uid) return uid;
  }
  return process.env.APP_LOCAL_DEV_USER || null;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  };
}
