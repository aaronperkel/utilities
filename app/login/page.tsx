import type { Metadata } from "next";
import { login } from "./actions";

export const metadata: Metadata = { title: "Log in — Perk Utilities" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string; next?: string }>;
}) {
  const { err, next } = await searchParams;
  const safeNext = next?.startsWith("/") ? next : "/";

  return (
    <main className="mx-auto max-w-sm py-16">
      <div className="panel p-6">
        <span className="eyebrow mb-1">Private site</span>
        <h1 className="text-lg font-bold">Resident access</h1>
        <p className="mt-1 mb-5 text-sm text-ink-muted">
          Enter the house passphrase to continue.
        </p>
        {err && <div className="flash flash-err">Wrong passphrase.</div>}
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
      </div>
    </main>
  );
}
