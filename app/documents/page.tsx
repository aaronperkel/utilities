import { requireUser } from "@/lib/auth";
import {
  DOCUMENT_CATEGORIES,
  MAX_DOCUMENT_BYTES,
  categoryFor,
  documentFileHref,
  fileKindLabel,
  formatFileSize,
  getDocuments,
} from "@/lib/documents";
import { DownloadIcon, EyeIcon } from "@/app/components/icons";
import AddDocumentForm from "@/app/documents/AddDocumentForm";
import DocumentActions from "@/app/documents/DocumentActions";

// Apartment paperwork: every resident reads, admins manage. Files are streamed
// from Blob through /files/<file_path>, so blob URLs never reach the browser.

/** "2026-08-13 14:05:00" (UTC DATETIME) → "Aug 13, 2026". */
function formatUploaded(ts: string): string {
  const [y, m, d] = ts.split(" ")[0].split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; err?: string }>;
}) {
  const [person, documents, { ok, err }] = await Promise.all([
    requireUser(),
    getDocuments(),
    searchParams,
  ]);

  const isAdmin = !!person.isAdmin;
  const categories = DOCUMENT_CATEGORIES.map((c) => ({ ...c }));

  // Unknown categories fall into "Other" via categoryFor, so no row is dropped.
  const groups = categories
    .map((c) => ({
      category: c,
      docs: documents.filter((d) => categoryFor(d.category).key === c.key),
    }))
    .filter((g) => g.docs.length > 0);

  return (
    <main>
      <div className="mb-6">
        <h1 className="page-title">Documents</h1>
        <p className="text-sm text-ink-muted">
          Lease, insurance, and other paperwork for 77 N Union #3.
        </p>
      </div>

      {err && <div className="flash flash-err">{err}</div>}
      {ok && <div className="flash flash-ok">{ok}</div>}

      {isAdmin && (
        <AddDocumentForm categories={categories} maxBytes={MAX_DOCUMENT_BYTES} />
      )}

      {documents.length === 0 ? (
        <div className="panel px-5 py-8 text-center text-sm text-ink-muted">
          {isAdmin
            ? "No documents yet. Add the lease or insurance policy to get started."
            : "No documents have been added yet."}
        </div>
      ) : (
        groups.map(({ category, docs }) => (
          <section key={category.key} className="mb-7">
            <div className="mb-2 flex items-center gap-3">
              <span className="eyebrow">
                {category.emoji} {category.label}
              </span>
              <span className="h-px flex-1 bg-line-soft" aria-hidden="true" />
            </div>

            <div className="panel overflow-x-auto">
              <table className="data-table table-stack table-stack-docs">
                <thead>
                  <tr>
                    <th>Document</th>
                    <th>Kind</th>
                    <th>Added</th>
                    <th className="num">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {docs.map((doc) => {
                    const href = documentFileHref(doc.filePath);
                    return (
                      <tr key={doc.id}>
                        <td className="cell-doc">
                          <div className="font-medium">{doc.title}</div>
                          <div className="figure text-xs text-ink-muted">
                            {formatFileSize(Number(doc.fileSize))}
                            {doc.uploadedByName ? ` · ${doc.uploadedByName}` : ""}
                          </div>
                        </td>
                        <td className="cell-kind">
                          <span className="tag bg-accent-soft text-accent">
                            {fileKindLabel(doc.contentType)}
                          </span>
                        </td>
                        <td className="cell-uploaded">
                          <span className="figure text-xs text-ink-muted">
                            {formatUploaded(doc.uploadedAt)}
                          </span>
                        </td>
                        <td className="num cell-actions">
                          <div className="flex justify-end gap-1.5">
                            <a
                              href={href}
                              target="_blank"
                              className="btn-icon"
                              title="View document"
                              aria-label={`View ${doc.title}`}
                            >
                              <EyeIcon />
                            </a>
                            <a
                              href={href}
                              download
                              className="btn-icon"
                              title="Download document"
                              aria-label={`Download ${doc.title}`}
                            >
                              <DownloadIcon />
                            </a>
                            {isAdmin && (
                              <DocumentActions
                                document={{
                                  id: doc.id,
                                  title: doc.title,
                                  category: categoryFor(doc.category).key,
                                }}
                                categories={categories}
                              />
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}
    </main>
  );
}
