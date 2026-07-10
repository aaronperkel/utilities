/**
 * scripts/migrate-pdfs-to-blob.ts
 *
 * One-time PDF migration: local BILLS_DIR tree → Vercel Blob. Blob keys equal
 * the BILLS_DIR-relative paths (= bills.pdf_path values, e.g. "2026/Gas/0623.pdf"),
 * so no DB changes are needed. After uploading, cross-checks every pdf_path in
 * the bills table against the blob store and reports any that are missing.
 *
 * Env (in .env.local):
 *   BLOB_READ_WRITE_TOKEN — from the Vercel Blob store (Storage tab)
 *   BILLS_DIR             — source directory (defaults to ./bill-pdfs)
 *   DB_*                  — the app's normal TiDB vars (for the cross-check)
 *
 * Run: npm run migrate-pdfs-to-blob
 */

for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(new URL(`../${file}`, import.meta.url).pathname);
  } catch {
    /* file not present */
  }
}

import fs from "node:fs/promises";
import path from "node:path";
import { head, put } from "@vercel/blob";
import { RowDataPacket } from "mysql2";
import { getPool, query } from "../lib/db";

const BILLS_DIR = process.env.BILLS_DIR || path.join(process.cwd(), "bill-pdfs");

async function* walkPdfs(dir: string): AsyncGenerator<string> {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walkPdfs(full);
    else if (entry.name.toLowerCase().endsWith(".pdf")) yield full;
  }
}

async function main() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("BLOB_READ_WRITE_TOKEN is not set (create a Blob store in Vercel → Storage).");
  }

  console.log(`Uploading PDFs from ${BILLS_DIR} …`);
  let uploaded = 0;
  for await (const file of walkPdfs(BILLS_DIR)) {
    const key = path.relative(BILLS_DIR, file).split(path.sep).join("/");
    const data = await fs.readFile(file);
    await put(key, data, {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/pdf",
    });
    console.log(`  ✓ ${key} (${(data.length / 1024).toFixed(0)} KB)`);
    uploaded++;
  }
  console.log(`${uploaded} PDF(s) uploaded.`);

  console.log("Cross-checking bills.pdf_path against the blob store …");
  const rows = await query<RowDataPacket>(
    "SELECT id, pdf_path AS pdfPath FROM bills WHERE pdf_path IS NOT NULL AND pdf_path <> ''",
  );
  let missing = 0;
  for (const row of rows) {
    try {
      await head(row.pdfPath);
    } catch {
      console.warn(`  ✗ bill ${row.id}: no blob for "${row.pdfPath}"`);
      missing++;
    }
  }
  console.log(
    missing === 0
      ? `All ${rows.length} bill PDF reference(s) resolve in Blob. Done.`
      : `${missing} of ${rows.length} bill reference(s) missing — those PDFs were not in ${BILLS_DIR}.`,
  );
  await getPool().end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
