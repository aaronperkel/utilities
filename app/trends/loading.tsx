// Instant shell for /trends: header, chart panel, three insight columns.
export default function TrendsLoading() {
  return (
    <main aria-busy="true">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="skeleton mb-2 h-7 w-28" />
          <div className="skeleton h-4 w-72 max-w-full" />
        </div>
        <div className="skeleton h-7 w-24" />
      </div>

      <div className="panel p-5">
        <div className="skeleton h-[340px] w-full" />
      </div>

      <div className="panel mt-6 grid divide-y divide-line-soft sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {[0, 1, 2].map((i) => (
          <div key={i} className="px-5 py-4">
            <div className="skeleton mb-3 h-3 w-32" />
            <div className="space-y-2.5">
              <div className="skeleton h-4 w-full" />
              <div className="skeleton h-4 w-full" />
              <div className="skeleton h-4 w-full" />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
