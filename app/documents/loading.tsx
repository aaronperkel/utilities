// Instant shell shown while the documents query runs.
// Mirrors page.tsx: title block, then two category sections of rows.
export default function DocumentsLoading() {
  return (
    <main aria-busy="true">
      <div className="mb-6">
        <div className="skeleton mb-2 h-7 w-40" />
        <div className="skeleton h-4 w-64" />
      </div>

      {[0, 1].map((section) => (
        <section key={section} className="mb-7">
          <div className="mb-2 flex items-center gap-3">
            <div className="skeleton h-3 w-24" />
            <span className="h-px flex-1 bg-line-soft" aria-hidden="true" />
          </div>
          <div className="panel divide-y divide-line-soft">
            {[0, 1, 2].map((row) => (
              <div key={row} className="flex items-center justify-between px-4 py-4">
                <div>
                  <div className="skeleton mb-1.5 h-4 w-44" />
                  <div className="skeleton h-3 w-24" />
                </div>
                <div className="skeleton h-4 w-16" />
              </div>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
