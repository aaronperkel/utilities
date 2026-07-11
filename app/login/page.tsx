import type { Metadata } from "next";
import Link from "next/link";
import { login, requestCode, submitCode } from "./actions";

export const metadata: Metadata = { title: "Log in — Perk Utilities" };

const ERRORS: Record<string, string> = {
  "unknown-email": "That email isn't registered for this household.",
  "rate-limited": "Too many codes requested. Wait a few minutes and try again.",
  "send-failed": "Couldn't send the email. Wait a minute and try again.",
  "bad-code": "Wrong code — check the email and try again.",
  expired: "That code expired or was used up. Request a fresh one.",
  passphrase: "Wrong passphrase.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    err?: string;
    next?: string;
    email?: string;
    step?: string;
    mode?: string;
  }>;
}) {
  const { err, next, email, step, mode } = await searchParams;
  const safeNext = next?.startsWith("/") ? next : "/";
  // The fallback is only offered where the env var exists (e.g. previews)
  const passphraseEnabled = Boolean(process.env.SITE_PASSPHRASE);
  const loginHref = (params: Record<string, string> = {}) => {
    const sp = new URLSearchParams(params);
    if (safeNext !== "/") sp.set("next", safeNext);
    const q = sp.toString();
    return q ? `/login?${q}` : "/login";
  };
  const flash = err && (
    <div className="flash flash-err">{ERRORS[err] ?? "Something went wrong."}</div>
  );

  let body: React.ReactNode;
  if (mode === "passphrase") {
    body = (
      <>
        <p className="mt-1 mb-5 text-sm text-ink-muted">
          Enter the house passphrase to continue.
        </p>
        {flash}
        <form action={login}>
          <input type="hidden" name="next" value={safeNext} />
          <label className="field-label" htmlFor="passphrase">
            Passphrase
          </label>
          <input
            className="field-input figure"
            type="password"
            id="passphrase"
            name="passphrase"
            autoFocus
            required
          />
          <button className="btn btn-primary mt-5 w-full" type="submit">
            Unlock
          </button>
        </form>
        <p className="mt-4 text-center text-sm">
          <Link className="text-ink-muted underline" href={loginHref()}>
            Sign in with an emailed code instead
          </Link>
        </p>
      </>
    );
  } else if (step === "code" && email) {
    body = (
      <>
        <p className="mt-1 mb-5 text-sm text-ink-muted">
          We sent a 6-digit code to <strong className="text-ink">{email}</strong>. It
          expires in 10 minutes.
        </p>
        {flash}
        <form action={submitCode}>
          <input type="hidden" name="next" value={safeNext} />
          <input type="hidden" name="email" value={email} />
          <label className="field-label" htmlFor="code">
            Code
          </label>
          <input
            className="field-input figure text-center text-xl tracking-[0.35em]"
            type="text"
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            placeholder="······"
            autoFocus
            required
          />
          <button className="btn btn-primary mt-5 w-full" type="submit">
            Sign in
          </button>
        </form>
        <p className="mt-4 text-center text-sm">
          <Link className="text-ink-muted underline" href={loginHref({ email })}>
            Request a new code
          </Link>
        </p>
      </>
    );
  } else {
    body = (
      <>
        <p className="mt-1 mb-5 text-sm text-ink-muted">
          Enter your email and we&apos;ll send you a one-time sign-in code.
        </p>
        {flash}
        <form action={requestCode}>
          <input type="hidden" name="next" value={safeNext} />
          <label className="field-label" htmlFor="email">
            Email
          </label>
          <input
            className="field-input"
            type="email"
            id="email"
            name="email"
            autoComplete="email"
            defaultValue={email}
            autoFocus
            required
          />
          <button className="btn btn-primary mt-5 w-full" type="submit">
            Email me a code
          </button>
        </form>
        <p className="mt-4 text-center text-sm">
          <Link
            className="text-ink-muted underline"
            href={loginHref({ mode: "passphrase" })}
          >
            Use the house passphrase instead
          </Link>
        </p>
      </>
    );
  }

  return (
    <main className="mx-auto max-w-sm py-16">
      <div className="panel p-6">
        <span className="eyebrow mb-1">Private site</span>
        <h1 className="text-lg font-bold">Resident access</h1>
        {body}
      </div>
    </main>
  );
}
