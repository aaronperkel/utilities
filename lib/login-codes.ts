// One-time email login codes (the login_codes table). A code is a 6-digit
// number hashed at rest, valid for 10 minutes, dead after 5 wrong guesses,
// and deleted on successful login. Requesting is rate-limited per person.

import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { RowDataPacket } from "mysql2";
import { execute, query } from "@/lib/db";

const CODE_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const MAX_CODES_PER_WINDOW = 5;
const DEDUPE_SECONDS = 30;

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

export type CreateCodeResult =
  | { kind: "created"; code: string; id: number }
  | { kind: "recent" } // a live code was minted seconds ago — it's already in flight
  | { kind: "rate-limited" };

/** Create and store a fresh code for the person, dedupe a burst of requests, or rate-limit. */
export async function createLoginCode(personId: number): Promise<CreateCodeResult> {
  const recent = await query<RowDataPacket>(
    `SELECT
       COUNT(*) AS windowCount,
       COALESCE(SUM(created_at > UTC_TIMESTAMP() - INTERVAL ${DEDUPE_SECONDS} SECOND
                    AND attempts < ${MAX_ATTEMPTS}), 0) AS burstCount
     FROM login_codes
     WHERE person_id = ? AND created_at > UTC_TIMESTAMP() - INTERVAL ${CODE_TTL_MINUTES} MINUTE`,
    [personId],
  );
  // Double-taps on a slow submit button used to mint one code per tap and
  // exhaust the window in a second; a code from the last few seconds still
  // answers this request, so don't create (or count) another.
  if (Number(recent[0]?.burstCount ?? 0) > 0) return { kind: "recent" };
  if (Number(recent[0]?.windowCount ?? 0) >= MAX_CODES_PER_WINDOW) {
    return { kind: "rate-limited" };
  }

  // Opportunistic cleanup; the hour of grace keeps the rate-limit window honest
  await execute(
    "DELETE FROM login_codes WHERE expires_at < UTC_TIMESTAMP() - INTERVAL 1 HOUR",
  );

  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const result = await execute(
    `INSERT INTO login_codes (person_id, code_hash, created_at, expires_at)
     VALUES (?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP() + INTERVAL ${CODE_TTL_MINUTES} MINUTE)`,
    [personId, hashCode(code)],
  );
  return { kind: "created", code, id: result.insertId };
}

/** Release a code that never reached the person (e.g. the email failed),
 *  so it doesn't count against the rate-limit window. */
export async function deleteLoginCode(id: number): Promise<void> {
  await execute("DELETE FROM login_codes WHERE id = ?", [id]);
}

interface LoginCodeRow extends RowDataPacket {
  id: number;
  codeHash: string;
  attempts: number;
}

export type CodeCheck = "ok" | "bad" | "expired";

/**
 * Check a submitted code against the person's newest live one.
 * "expired" also covers never-requested and attempt-limit-exhausted codes —
 * every case where the fix is requesting a fresh code.
 */
export async function verifyLoginCode(personId: number, code: string): Promise<CodeCheck> {
  const rows = await query<LoginCodeRow>(
    `SELECT id, code_hash AS codeHash, attempts FROM login_codes
     WHERE person_id = ? AND expires_at > UTC_TIMESTAMP()
     ORDER BY id DESC LIMIT 1`,
    [personId],
  );
  const row = rows[0];
  if (!row || row.attempts >= MAX_ATTEMPTS) return "expired";

  const submitted = Buffer.from(hashCode(code), "hex");
  const stored = Buffer.from(row.codeHash, "hex");
  if (submitted.length === stored.length && timingSafeEqual(submitted, stored)) {
    await execute("DELETE FROM login_codes WHERE person_id = ?", [personId]);
    return "ok";
  }
  await execute("UPDATE login_codes SET attempts = attempts + 1 WHERE id = ?", [row.id]);
  return "bad";
}
