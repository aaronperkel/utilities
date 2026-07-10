import Link from "next/link";

/** Numbered pagination with prev/next, ported from paginationHtml(). */
export default function Pagination({
  currentPage,
  totalPages,
  basePath,
}: {
  currentPage: number;
  totalPages: number;
  basePath: string;
}) {
  if (totalPages <= 1) return null;

  const start = Math.max(1, currentPage - 2);
  const end = Math.min(totalPages, currentPage + 2);
  const pages = Array.from({ length: end - start + 1 }, (_, i) => start + i);
  const href = (p: number) => `${basePath}?page=${p}`;

  const pageLink = (p: number) => (
    <Link
      key={p}
      href={href(p)}
      aria-current={p === currentPage ? "page" : undefined}
      className={`inline-flex h-8 min-w-8 items-center justify-center rounded-(--radius-sm) px-2 text-sm ${
        p === currentPage
          ? "bg-primary text-white font-semibold"
          : "text-ink hover:bg-white/[0.06]"
      }`}
    >
      {p}
    </Link>
  );

  return (
    <nav className="mt-6 flex flex-wrap items-center justify-between gap-3" aria-label="Pagination">
      <div className="text-sm text-ink-muted">
        Page {currentPage} of {totalPages}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {currentPage > 1 ? (
          <Link className="btn btn-outline btn-sm" href={href(currentPage - 1)} aria-label="Previous page">
            « Prev
          </Link>
        ) : (
          <span className="btn btn-outline btn-sm opacity-40 pointer-events-none">« Prev</span>
        )}

        {start > 1 && (
          <>
            {pageLink(1)}
            {start > 2 && <span className="px-1 text-ink-muted">…</span>}
          </>
        )}

        {pages.map(pageLink)}

        {end < totalPages && (
          <>
            {end < totalPages - 1 && <span className="px-1 text-ink-muted">…</span>}
            {pageLink(totalPages)}
          </>
        )}

        {currentPage < totalPages ? (
          <Link className="btn btn-outline btn-sm" href={href(currentPage + 1)} aria-label="Next page">
            Next »
          </Link>
        ) : (
          <span className="btn btn-outline btn-sm opacity-40 pointer-events-none">Next »</span>
        )}
      </div>
    </nav>
  );
}
