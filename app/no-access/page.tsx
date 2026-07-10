export default function NoAccessPage() {
  return (
    <main className="mx-auto max-w-xl px-5 py-24 text-center">
      <span className="eyebrow mb-2">403</span>
      <h1 className="mb-3 text-2xl font-bold">Not authorized</h1>
      <p className="text-ink-muted">
        Your login isn&rsquo;t linked to a resident of this apartment. If you think
        this is a mistake, ask the admin to add your account.
      </p>
    </main>
  );
}
