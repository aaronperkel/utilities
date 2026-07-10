"use server";

import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, createSessionToken, sessionCookieOptions } from "@/lib/session";

function passphraseMatches(input: string): boolean {
  const expected = process.env.SITE_PASSPHRASE;
  if (!expected) return false;
  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function login(formData: FormData): Promise<void> {
  const next = String(formData.get("next") ?? "/");
  const safeNext = next.startsWith("/") ? next : "/";

  if (!passphraseMatches(String(formData.get("passphrase") ?? ""))) {
    redirect(`/login?err=1&next=${encodeURIComponent(safeNext)}`);
  }

  // The passphrase logs in as the site owner; authorization still goes
  // through tblPeople like any other uid.
  const uid = (process.env.SITE_OWNER_UID ?? "aperkel").toLowerCase();
  const jar = await cookies();
  jar.set(SESSION_COOKIE, await createSessionToken(uid), sessionCookieOptions());
  redirect(safeNext);
}
