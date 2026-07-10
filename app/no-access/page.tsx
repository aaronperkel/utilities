export default function NoAccessPage() {
  return (
    <main className="mx-auto max-w-xl px-5 py-24 text-center">
      <h1 className="text-2xl font-bold mb-3">403 — Not authorized</h1>
      <p className="text-ink-muted">
        You are not authorized to access this application. If you think this is
        a mistake, ask the admin to add your account.
      </p>
    </main>
  );
}
