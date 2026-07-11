"use server";

import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getPersonByEmail } from "@/lib/auth";
import { loginCodeEmailHtml, emailIdentity } from "@/lib/emails";
import { createLoginCode, verifyLoginCode } from "@/lib/login-codes";
import { sendSmtpMail } from "@/lib/mail";
import { SESSION_COOKIE, createSessionToken, sessionCookieOptions } from "@/lib/session";

function safeNext(formData: FormData): string {
  const next = String(formData.get("next") ?? "/");
  return next.startsWith("/") ? next : "/";
}

function loginUrl(params: Record<string, string>): string {
  return `/login?${new URLSearchParams(params)}`;
}

async function startSession(email: string): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, await createSessionToken(email), sessionCookieOptions());
}

/** Step 1: email a one-time code to a resident address. */
export async function requestCode(formData: FormData): Promise<void> {
  const next = safeNext(formData);
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  const person = email ? await getPersonByEmail(email) : null;
  if (!person) {
    redirect(loginUrl({ err: "unknown-email", email, next }));
  }

  const code = await createLoginCode(person.id);
  if (!code) {
    redirect(loginUrl({ err: "rate-limited", email, next }));
  }

  const sent = await sendSmtpMail(
    person.email,
    `${code} is your Perk Utilities login code`,
    loginCodeEmailHtml({ personName: person.name, code }, emailIdentity()),
  );
  if (!sent) {
    redirect(loginUrl({ err: "send-failed", email, next }));
  }

  redirect(loginUrl({ step: "code", email, next }));
}

/** Step 2: check the code and start a session as that person. */
export async function submitCode(formData: FormData): Promise<void> {
  const next = safeNext(formData);
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const code = String(formData.get("code") ?? "").replace(/\D/g, "");

  const person = email ? await getPersonByEmail(email) : null;
  if (!person) {
    redirect(loginUrl({ err: "unknown-email", email, next }));
  }

  const check = await verifyLoginCode(person.id, code);
  if (check === "bad") {
    redirect(loginUrl({ err: "bad-code", step: "code", email, next }));
  }
  if (check === "expired") {
    // The fix is a fresh code, so land back on the email step
    redirect(loginUrl({ err: "expired", email, next }));
  }

  await startSession(person.email);
  redirect(next);
}

function passphraseMatches(input: string): boolean {
  const expected = process.env.SITE_PASSPHRASE;
  if (!expected) return false;
  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Fallback while the code flow beds in: the house passphrase logs in as the
 *  site owner; authorization still goes through the people table. */
export async function login(formData: FormData): Promise<void> {
  const next = safeNext(formData);

  if (!passphraseMatches(String(formData.get("passphrase") ?? ""))) {
    redirect(loginUrl({ err: "passphrase", mode: "passphrase", next }));
  }

  await startSession(
    (process.env.SITE_OWNER_EMAIL ?? "me@aaronperkel.com").toLowerCase(),
  );
  redirect(next);
}
