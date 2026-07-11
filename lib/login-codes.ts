// One-time email login codes (the login_codes table). A code is a 6-digit
// number hashed at rest, valid for 10 minutes, dead after 5 wrong guesses,
// and deleted on successful login. Requesting is rate-limited per person.

import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { RowDataPacket } from "mysql2";
import { execute, query } from "@/lib/db";

const CODE_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const MAX_CODES_PER_WINDOW = 3;

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

/** Create and store a fresh code for the person, or null when rate-limited. */
export async function createLoginCode(personId: number): Promise<string | null> {
  const recent = await query<RowDataPacket>(
    `SELECT COUNT(*) AS n FROM login_codes
     WHERE person_id = ? AND created_at > UTC_TIMESTAMP() - INTERVAL ${CODE_TTL_MINUTES} MINUTE`,
    [personId],
  );
  if (Number(recent[0]?.n ?? 0) >= MAX_CODES_PER_WINDOW) return null;

  // Opportunistic cleanup; the hour of grace keeps the rate-limit window honest
  await execute(
    "DELETE FROM login_codes WHERE expires_at < UTC_TIMESTAMP() - INTERVAL 1 HOUR",
  );

  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  await execute(
    `INSERT INTO login_codes (person_id, code_hash, created_at, expires_at)
     VALUES (?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP() + INTERVAL ${CODE_TTL_MINUTES} MINUTE)`,
    [personId, hashCode(code)],
  );
  return code;
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
