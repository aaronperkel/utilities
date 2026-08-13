"use client";

import { upload } from "@vercel/blob/client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { addDocument, AddDocumentState } from "@/app/documents/actions";

interface CategoryOption {
  key: string;
  label: string;
  emoji: string;
}

/**
 * Browsers report an empty file.type for HEIC (and occasionally for PDFs saved
 * by scanner apps), which the token route would then reject. The extension is
 * the more reliable signal, so it wins.
 */
const EXT_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  heic: "image/heic",
  heif: "image/heif",
};

function resolveContentType(file: File): string {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return EXT_TYPES[ext] ?? file.type;
}

/** Blob keys tolerate less than filenames do; keep them boring. */
function sanitizeName(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9.\-_]/g, "-").replace(/-+/g, "-");
  return cleaned.replace(/^[.-]+/, "") || "document";
}

/**
 * Two-phase add: the file goes straight from the browser to Vercel Blob (so it
 * is not bounded by the serverless request-body cap), then a small server
 * action records the row.
 */
export default function AddDocumentForm({
  categories,
  maxBytes,
}: {
  categories: CategoryOption[];
  maxBytes: number;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, setState] = useState<AddDocumentState>({ errors: [] });
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);

  const maxLabel = `${Math.round(maxBytes / (1024 * 1024))}MB`;
  const accept = [...new Set(Object.values(EXT_TYPES))].join(",");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const file = data.get("file");
    const title = String(data.get("title") ?? "").trim();
    const category = String(data.get("category") ?? "");

    const errors: string[] = [];
    if (!title) errors.push("Title is required.");
    if (!category) errors.push("Pick a category.");
    if (!(file instanceof File) || file.size === 0) errors.push("Choose a file to upload.");
    else if (file.size > maxBytes) errors.push(`File is too large. Maximum size is ${maxLabel}.`);
    else if (!Object.values(EXT_TYPES).includes(resolveContentType(file))) {
      errors.push("Only PDF, PNG, JPEG, and HEIC files are allowed.");
    }
    if (errors.length > 0) {
      setState({ errors });
      return;
    }

    const doc = file as File;
    setPending(true);
    setState({ errors: [] });
    setProgress(0);

    try {
      const contentType = resolveContentType(doc);
      const blob = await upload(`documents/${sanitizeName(doc.name)}`, doc, {
        access: "public",
        contentType,
        handleUploadUrl: "/api/documents/upload",
        onUploadProgress: ({ percentage }) => setProgress(percentage),
      });

      const save = new FormData();
      save.set("title", title);
      save.set("category", category);
      save.set("file_path", blob.pathname);
      save.set("content_type", contentType);
      save.set("file_size", String(doc.size));

      const result = await addDocument({ errors: [] }, save);
      if (result.errors.length > 0) {
        setState(result);
        return;
      }

      form.reset();
      setOpen(false);
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setState({ errors: [`Upload failed: ${message}`] });
    } finally {
      setPending(false);
      setProgress(null);
    }
  }

  return (
    <div className="mb-6">
      <div className="mb-2 flex justify-end">
        <button
          type="button"
          className={`btn btn-sm ${open ? "" : "btn-primary"}`}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? "Close" : "+ Add document"}
        </button>
      </div>

      {open && (
        <div className="panel p-5">
          {state.errors.length > 0 && (
            <div className="flash flash-err">
              <strong>Please correct the following:</strong>
              <ul className="mt-1 list-disc pl-5">
                {state.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          )}

          <form ref={formRef} onSubmit={handleSubmit}>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label className="field-label" htmlFor="title">
                  Title
                </label>
                <input
                  className="field-input"
                  id="title"
                  name="title"
                  maxLength={150}
                  placeholder="Lease 2026–2027"
                  required
                />
              </div>
              <div>
                <label className="field-label" htmlFor="category">
                  Category
                </label>
                <select id="category" name="category" required className="field-input" defaultValue="">
                  <option value="" disabled>
                    Select...
                  </option>
                  {categories.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.emoji} {c.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-4">
              <label className="field-label" htmlFor="file">
                File
              </label>
              <input className="field-input" type="file" id="file" name="file" accept={accept} required />
              <small className="text-xs text-ink-muted">
                PDF, PNG, JPEG, or HEIC. Max {maxLabel}.
              </small>
            </div>

            {progress !== null && (
              <div className="mt-4">
                <div
                  className="h-1.5 w-full overflow-hidden rounded-(--radius-sm) bg-panel-2"
                  role="progressbar"
                  aria-valuenow={Math.round(progress)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Upload progress"
                >
                  <div
                    className="h-full bg-primary transition-[width] duration-150"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <small className="figure text-xs text-ink-muted">
                  Uploading… {Math.round(progress)}%
                </small>
              </div>
            )}

            <div className="mt-5 flex gap-2">
              <button type="submit" className="btn btn-primary" disabled={pending}>
                {pending ? "Uploading…" : "Save document"}
              </button>
              <button
                type="button"
                className="btn"
                disabled={pending}
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
