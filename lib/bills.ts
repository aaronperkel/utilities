import { RowDataPacket } from "mysql2";
import { query } from "@/lib/db";

export interface Bill extends RowDataPacket {
  id: number;
  typeName: string;
  typeEmoji: string;
  billDate: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD
  total: number;
  perPersonCost: number;
  status: "paid" | "unpaid";
  pdfPath: string | null;
}

export interface BillType extends RowDataPacket {
  id: number;
  name: string;
  emoji: string;
  processingFee: number;
}

export interface RentConfig extends RowDataPacket {
  monthlyRent: number;
  leaseStart: string;
  leaseEnd: string;
}

const BILL_SELECT = `
  SELECT b.id, t.name AS typeName, t.emoji AS typeEmoji,
         b.bill_date AS billDate, b.due_date AS dueDate,
         b.total, b.per_person_cost AS perPersonCost, b.status,
         b.pdf_path AS pdfPath
  FROM bills b
  JOIN bill_types t ON t.id = b.type_id`;

export async function getBillTypes(): Promise<BillType[]> {
  return query<BillType>(
    "SELECT id, name, emoji, processing_fee AS processingFee FROM bill_types ORDER BY name",
  );
}

export async function getBillTypeByName(name: string): Promise<BillType | null> {
  const rows = await query<BillType>(
    "SELECT id, name, emoji, processing_fee AS processingFee FROM bill_types WHERE name = ?",
    [name],
  );
  return rows[0] ?? null;
}

/** type name → emoji map, with the 📄 fallback handled by the caller default. */
export async function getEmojiMap(): Promise<Record<string, string>> {
  try {
    const rows = await query<RowDataPacket>("SELECT name, emoji FROM bill_types");
    return Object.fromEntries(rows.map((r) => [r.name, r.emoji]));
  } catch {
    return {};
  }
}

export function billEmoji(map: Record<string, string>, typeName: string): string {
  return map[typeName] ?? "📄";
}

export async function getTotalBillCount(): Promise<number> {
  const rows = await query<RowDataPacket>("SELECT COUNT(*) AS n FROM bills");
  return Number(rows[0].n);
}

export async function getBillsForPage(limit: number, offset: number): Promise<Bill[]> {
  const safeLimit = Math.max(1, Math.trunc(limit));
  const safeOffset = Math.max(0, Math.trunc(offset));
  return query<Bill>(
    `${BILL_SELECT}
     ORDER BY b.bill_date DESC
     LIMIT ${safeLimit} OFFSET ${safeOffset}`,
  );
}

/** Total outstanding for one person across unpaid bills. */
export async function getUserOwedAmount(personId: number): Promise<number> {
  const rows = await query<RowDataPacket>(
    `SELECT SUM(b.per_person_cost) AS owed
     FROM bills b
     JOIN bill_debts d ON b.id = d.bill_id
     WHERE d.person_id = ? AND b.status <> 'paid'`,
    [personId],
  );
  return Number(rows[0]?.owed ?? 0);
}

/** Bill IDs the person still owes on (bills not globally paid). */
export async function getUserOwedBillIds(personId: number): Promise<Set<number>> {
  const rows = await query<RowDataPacket>(
    `SELECT d.bill_id AS billId
     FROM bill_debts d
     JOIN bills b ON d.bill_id = b.id
     WHERE d.person_id = ? AND b.status <> 'paid'`,
    [personId],
  );
  return new Set(rows.map((r) => Number(r.billId)));
}

/** The person's earliest-due unpaid bill (dashboard "next due" cell). */
export async function getUserNextDue(
  personId: number,
): Promise<{ dueDate: string; typeName: string } | null> {
  const rows = await query<RowDataPacket>(
    `SELECT b.due_date AS dueDate, t.name AS typeName
     FROM bill_debts d
     JOIN bills b ON d.bill_id = b.id
     JOIN bill_types t ON t.id = b.type_id
     WHERE d.person_id = ? AND b.status <> 'paid'
     ORDER BY b.due_date ASC
     LIMIT 1`,
    [personId],
  );
  return rows[0] ? { dueDate: rows[0].dueDate, typeName: rows[0].typeName } : null;
}

/** person name → total owed across all unpaid bills (admin "Who Owes What" card). */
export async function getOwedAmounts(): Promise<{ name: string; amount: number }[]> {
  const rows = await query<RowDataPacket>(
    `SELECT p.name, SUM(b.per_person_cost) AS totalOwed
     FROM bill_debts d
     JOIN bills b ON d.bill_id = b.id
     JOIN people p ON d.person_id = p.id
     WHERE b.status = 'unpaid'
     GROUP BY p.name
     HAVING totalOwed > 0
     ORDER BY p.name`,
  );
  return rows.map((r) => ({ name: r.name, amount: Number(r.totalOwed) }));
}

export async function getAllPeople(): Promise<{ id: number; name: string }[]> {
  const rows = await query<RowDataPacket>(
    "SELECT id, name FROM people ORDER BY name ASC",
  );
  return rows.map((r) => ({ id: Number(r.id), name: r.name }));
}

export async function getRentConfig(): Promise<RentConfig | null> {
  try {
    const rows = await query<RentConfig>(
      `SELECT monthly_rent AS monthlyRent, lease_start AS leaseStart, lease_end AS leaseEnd
       FROM rent_config ORDER BY id DESC LIMIT 1`,
    );
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

/** Map a stored pdf_path (e.g. "2026/Gas/0623.pdf") to the auth-gated file route. */
export function billFileHref(pdfPath: string): string {
  return "/files/" + pdfPath;
}
