// Every URL on the old site lands here: the household moved to Lejer.
const LEJER = "https://uselejer.com/77-n-union-st";

export default function Moved() {
  return (
    <main className="mx-auto w-full max-w-[560px] py-10">
      <section className="panel p-6 sm:p-8">
        <p className="eyebrow">77 N Union #3</p>
        <h1 className="page-title mt-2">Moved to Lejer</h1>
        <p className="mt-4">
          The bills, who owes what, and every statement PDF now live at{" "}
          <a className="underline" href={LEJER}>
            uselejer.com/77-n-union-st
          </a>
          .
        </p>
        <ol className="mt-4 list-decimal space-y-2 pl-5">
          <li>Sign in there with the same email you used here. A code is emailed to you, like before.</li>
          <li>
            Re-add the calendar from <strong>Account</strong>. This site&rsquo;s calendar link no longer
            updates.
          </li>
        </ol>
        <p className="mt-4 text-sm text-ink-muted">This site is closed. Nothing here changes anymore.</p>
        <a className="btn btn-primary mt-6" href={LEJER}>
          Open 77 N Union #3 on Lejer →
        </a>
      </section>
    </main>
  );
}
