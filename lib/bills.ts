import { RowDataPacket } from "mysql2";
import { query } from "@/lib/db";

export interface Bill extends RowDataPacket {
  pmkBillID: number;
  fldDate: string;
  fldItem: string;
  fldTotal: number;
  fldCost: number;
  fldDue: string;
  fldStatus: "Paid" | "Unpaid";
  fldView: string;
}

export interface BillType extends RowDataPacket {
  typeID: number;
  typeName: string;
  typeEmoji: string;
  processingFee: number;
}

export interface RentConfig extends RowDataPacket {
  rentAmount: number;
  startDate: string;
  endDate: string;
}

export async function getBillTypes(): Promise<BillType[]> {
  return query<BillType>(
    "SELECT typeID, typeName, typeEmoji, processingFee FROM tblBillTypes ORDER BY typeName",
  );
}

export async function getBillTypeFee(typeName: string): Promise<number> {
  const rows = await query<RowDataPacket>(
    "SELECT processingFee FROM tblBillTypes WHERE typeName = ?",
    [typeName],
  );
  return Number(rows[0]?.processingFee ?? 0);
}

/** typeName → emoji map, with the PHP fallback of 📄 handled by the caller default. */
export async function getEmojiMap(): Promise<Record<string, string>> {
  try {
    const rows = await query<RowDataPacket>(
      "SELECT typeName, typeEmoji FROM tblBillTypes",
    );
    return Object.fromEntries(rows.map((r) => [r.typeName, r.typeEmoji]));
  } catch {
    return {};
  }
}

export function billEmoji(map: Record<string, string>, item: string): string {
  return map[item] ?? "📄";
}

export async function getTotalBillCount(): Promise<number> {
  const rows = await query<RowDataPacket>("SELECT COUNT(*) AS n FROM tblUtilities");
  return Number(rows[0].n);
}

export async function getBillsForPage(limit: number, offset: number): Promise<Bill[]> {
  const safeLimit = Math.max(1, Math.trunc(limit));
  const safeOffset = Math.max(0, Math.trunc(offset));
  return query<Bill>(
    `SELECT pmkBillID, fldDate, fldItem, fldTotal, fldCost, fldDue, fldStatus, fldView
     FROM tblUtilities
     ORDER BY fldDate DESC
     LIMIT ${safeLimit} OFFSET ${safeOffset}`,
  );
}

/** Total outstanding for one person across unpaid bills. */
export async function getUserOwedAmount(personName: string): Promise<number> {
  const rows = await query<RowDataPacket>(
    `SELECT SUM(u.fldCost) AS owed
     FROM tblUtilities u
     JOIN tblBillOwes bo ON u.pmkBillID = bo.billID
     JOIN tblPeople p ON bo.personID = p.personID
     WHERE p.personName = ? AND u.fldStatus <> 'Paid'`,
    [personName],
  );
  return Number(rows[0]?.owed ?? 0);
}

/** Bill IDs the person still owes on (bills not globally Paid). */
export async function getUserOwedBillIds(personName: string): Promise<Set<number>> {
  const rows = await query<RowDataPacket>(
    `SELECT bo.billID
     FROM tblBillOwes bo
     JOIN tblPeople p ON bo.personID = p.personID
     JOIN tblUtilities u ON bo.billID = u.pmkBillID
     WHERE p.personName = ? AND u.fldStatus <> 'Paid'`,
    [personName],
  );
  return new Set(rows.map((r) => Number(r.billID)));
}

/** personName → total owed across all unpaid bills (admin "Who Owes What" card). */
export async function getOwedAmounts(): Promise<{ name: string; amount: number }[]> {
  const rows = await query<RowDataPacket>(
    `SELECT p.personName, SUM(u.fldCost) AS totalOwed
     FROM tblBillOwes bo
     JOIN tblUtilities u ON bo.billID = u.pmkBillID
     JOIN tblPeople p ON bo.personID = p.personID
     WHERE u.fldStatus = 'Unpaid'
     GROUP BY p.personName
     HAVING totalOwed > 0
     ORDER BY p.personName`,
  );
  return rows.map((r) => ({ name: r.personName, amount: Number(r.totalOwed) }));
}

/** personIDs who still owe for a bill. */
export async function getOwingPersonIds(billId: number): Promise<Set<number>> {
  const rows = await query<RowDataPacket>(
    "SELECT personID FROM tblBillOwes WHERE billID = ?",
    [billId],
  );
  return new Set(rows.map((r) => Number(r.personID)));
}

export async function getAllPeople(): Promise<
  { personID: number; personName: string }[]
> {
  const rows = await query<RowDataPacket>(
    "SELECT personID, personName FROM tblPeople ORDER BY personName ASC",
  );
  return rows.map((r) => ({ personID: Number(r.personID), personName: r.personName }));
}

export async function getRentConfig(): Promise<RentConfig | null> {
  try {
    const rows = await query<RentConfig>(
      "SELECT rentAmount, startDate, endDate FROM tblRentConfig ORDER BY id DESC LIMIT 1",
    );
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

/** Map a stored fldView path (e.g. "public/2026/Gas/0623.pdf") to the auth-gated file route. */
export function billFileHref(fldView: string): string {
  return "/files/" + fldView.replace(/^public\//, "");
}
