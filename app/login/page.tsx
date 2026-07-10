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
    <main className="mx-auto max-w-sm py-12">
      <section className="card px-6 py-6">
        <h1 className="text-xl font-bold">Private site</h1>
        <p className="mt-1 mb-5 text-sm text-ink-muted">
          Enter the passphrase to continue.
        </p>
        {err && (
          <div className="mb-4 rounded-(--radius-sm) border border-unpaid/40 bg-unpaid/10 px-4 py-3 text-sm">
            Wrong passphrase.
          </div>
        )}
        <form action={login}>
          <input type="hidden" name="next" value={safeNext} />
          <label className="field-label" htmlFor="passphrase">
            Passphrase
          </label>
          <input
            className="field-input"
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
      </section>
    </main>
  );
}
