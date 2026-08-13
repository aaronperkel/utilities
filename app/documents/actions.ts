"use server";

import { del, head } from "@vercel/blob";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminAction } from "@/lib/auth";
import { execute, query } from "@/lib/db";
import {
  ALLOWED_DOCUMENT_TYPES,
  MAX_DOCUMENT_BYTES,
  isDocumentCategory,
  isDocumentPath,
} from "@/lib/documents";
import { RowDataPacket } from "mysql2";

const DOCS = "/documents";

function done(ok: string): never {
  revalidatePath(DOCS);
  redirect(`${DOCS}?ok=${encodeURIComponent(ok)}`);
}

function fail(err: string): never {
  redirect(`${DOCS}?err=${encodeURIComponent(err)}`);
}

export interface AddDocumentState {
  errors: string[];
}

/**
 * Records a document whose bytes are already in Blob (uploaded straight from
 * the browser). Returns errors instead of redirecting because the client
 * component owns the two-phase upload → save flow and renders them inline.
 */
export async function addDocument(
  _prev: AddDocumentState,
  formData: FormData,
): Promise<AddDocumentState> {
  let admin;
  try {
    admin = await requireAdminAction();
  } catch {
    return { errors: ["Admin access required."] };
  }

  const errors: string[] = [];
  const title = String(formData.get("title") ?? "").trim();
  const category = String(formData.get("category") ?? "");
  const filePath = String(formData.get("file_path") ?? "");
  const contentType = String(formData.get("content_type") ?? "");
  const fileSize = Number(formData.get("file_size") ?? 0);

  if (!title) errors.push("Title is required.");
  else if (title.length > 150) errors.push("Title must be 150 characters or fewer.");
  if (!isDocumentCategory(category)) errors.push("Pick a valid category.");
  if (!filePath) errors.push("The file did not finish uploading. Try again.");
  else if (!isDocumentPath(filePath)) errors.push("Unexpected upload location.");
  if (!(ALLOWED_DOCUMENT_TYPES as readonly string[]).includes(contentType)) {
    errors.push("Only PDF and image files are allowed.");
  }
  if (!Number.isFinite(fileSize) || fileSize <= 0) errors.push("Empty file.");
  else if (fileSize > MAX_DOCUMENT_BYTES) errors.push("File is too large. Maximum size is 25MB.");

  if (errors.length > 0) return { errors };

  // Confirm the blob really exists before recording it, so a fabricated request
  // can't create a row pointing at nothing (or at another feature's key).
  try {
    await head(filePath);
  } catch {
    return { errors: ["Could not find the uploaded file. Try again."] };
  }

  try {
    await execute(
      `INSERT INTO documents (title, category, file_path, content_type, file_size, uploaded_at, uploaded_by)
       VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP(), ?)`,
      [title, category, filePath, contentType, Math.trunc(fileSize), admin.id],
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { errors: [`Database error: ${message}`] };
  }

  revalidatePath(DOCS);
  return { errors: [] };
}

/** Title and category only — fixing a typo shouldn't mean re-uploading a 20MB scan. */
export async function updateDocument(formData: FormData): Promise<void> {
  try {
    await requireAdminAction();
  } catch {
    fail("Admin access required.");
  }

  const id = Number(formData.get("document_id"));
  const title = String(formData.get("title") ?? "").trim();
  const category = String(formData.get("category") ?? "");

  if (!id) fail("Invalid document ID.");
  if (!title) fail("Title is required.");
  if (title.length > 150) fail("Title must be 150 characters or fewer.");
  if (!isDocumentCategory(category)) fail("Pick a valid category.");

  await execute("UPDATE documents SET title = ?, category = ? WHERE id = ?", [
    title,
    category,
    id,
  ]);

  done(`'${title}' updated.`);
}

export async function removeDocument(formData: FormData): Promise<void> {
  try {
    await requireAdminAction();
  } catch {
    fail("Admin access required.");
  }

  const id = Number(formData.get("document_id"));
  if (!id) fail("Invalid document ID.");

  const rows = await query<RowDataPacket>(
    "SELECT title, file_path AS filePath FROM documents WHERE id = ? LIMIT 1",
    [id],
  );
  const doc = rows[0];
  if (!doc) fail("That document no longer exists.");

  // Belt-and-braces: never let a tampered row point del() at a bill's PDF.
  if (isDocumentPath(doc.filePath)) {
    try {
      await del(doc.filePath);
    } catch (err) {
      // A stale blob is recoverable; a row that can't be deleted is not.
      console.error("Blob delete failed for", doc.filePath, err);
    }
  }

  await execute("DELETE FROM documents WHERE id = ?", [id]);
  done(`'${doc.title}' removed.`);
}
