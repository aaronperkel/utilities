import { RowDataPacket } from "mysql2";
import { query } from "@/lib/db";

/**
 * Apartment paperwork — lease, renters insurance, move-in checklists. Read by
 * every resident at /documents, managed by admins. Files live in Vercel Blob
 * under DOCUMENT_PREFIX and are served through the auth-gated /files route.
 */

/**
 * Categories are a fixed code-side list rather than a table: unlike bill_types
 * they carry no math and would only add a fourth CRUD surface to the portal.
 */
export const DOCUMENT_CATEGORIES = [
  { key: "lease", label: "Lease", emoji: "📄" },
  { key: "insurance", label: "Insurance", emoji: "🛡️" },
  { key: "utilities", label: "Utilities", emoji: "💡" },
  { key: "other", label: "Other", emoji: "📎" },
] as const;

export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

/** Every document blob key starts here, which is what keeps uploads and
 *  deletes from ever reaching a bill's PDF. */
export const DOCUMENT_PREFIX = "documents/";

export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;

/** Deliberately excludes image/svg+xml — SVGs can execute script when served inline. */
export const ALLOWED_DOCUMENT_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/heic",
  "image/heif",
] as const;

export interface Document extends RowDataPacket {
  id: number;
  title: string;
  category: string;
  filePath: string;
  contentType: string;
  fileSize: number;
  uploadedAt: string;
  uploadedByName: string | null;
}

// LEFT JOIN so a document outlives the resident who uploaded it (people rows
// are hard-deleted by removePerson, and there are no FKs on TiDB).
const DOCUMENT_SELECT = `
  SELECT d.id, d.title, d.category,
         d.file_path AS filePath, d.content_type AS contentType,
         d.file_size AS fileSize, d.uploaded_at AS uploadedAt,
         p.name AS uploadedByName
  FROM documents d
  LEFT JOIN people p ON p.id = d.uploaded_by`;

export async function getDocuments(): Promise<Document[]> {
  return query<Document>(`${DOCUMENT_SELECT} ORDER BY d.title ASC`);
}

export async function getDocumentById(id: number): Promise<Document | null> {
  const rows = await query<Document>(`${DOCUMENT_SELECT} WHERE d.id = ? LIMIT 1`, [id]);
  return rows[0] ?? null;
}

/** Look up a category, falling back to "Other" so a hand-edited row can't break the page. */
export function categoryFor(key: string): DocumentCategory {
  return (
    DOCUMENT_CATEGORIES.find((c) => c.key === key) ??
    DOCUMENT_CATEGORIES[DOCUMENT_CATEGORIES.length - 1]
  );
}

export function isDocumentCategory(key: string): boolean {
  return DOCUMENT_CATEGORIES.some((c) => c.key === key);
}

/** True only for blob keys this feature owns — guards uploads and deletes. */
export function isDocumentPath(filePath: string): boolean {
  return filePath.startsWith(DOCUMENT_PREFIX) && !filePath.includes("..");
}

/** Map a stored file_path ("documents/lease-x1y2.pdf") to the auth-gated file route. */
export function documentFileHref(filePath: string): string {
  return "/files/" + filePath;
}

/** Short uppercase label for the kind tag, e.g. "application/pdf" → "PDF". */
export function fileKindLabel(contentType: string): string {
  const subtype = contentType.split("/")[1] ?? contentType;
  return subtype === "jpeg" ? "JPG" : subtype.toUpperCase();
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
