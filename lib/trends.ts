import { RowDataPacket } from "mysql2";
import { query } from "@/lib/db";

export interface MonthlyTotals {
  labels: string[]; // 'YYYY-MM'
  monthly: Map<string, { Gas: number; Electric: number }>;
}

/** Monthly Gas/Electric totals for all history, pivoted by month. */
export async function getMonthlyTotals(): Promise<MonthlyTotals> {
  const rows = await query<RowDataPacket>(
    `SELECT DATE_FORMAT(fldDate, '%Y-%m') AS month, fldItem, SUM(fldTotal) AS total
     FROM tblUtilities
     WHERE fldItem IN ('Gas','Electric')
     GROUP BY month, fldItem
     ORDER BY month`,
  );
  const monthly = new Map<string, { Gas: number; Electric: number }>();
  for (const r of rows) {
    const m = r.month as string;
    if (!monthly.has(m)) monthly.set(m, { Gas: 0, Electric: 0 });
    monthly.get(m)![r.fldItem as "Gas" | "Electric"] = Number(r.total);
  }
  return { labels: [...monthly.keys()], monthly };
}

/** Same-month-last-year series for an ordered list of 'YYYY-MM' labels. */
export function lastYearSeries(
  labels: string[],
  monthly: MonthlyTotals["monthly"],
  item: "Gas" | "Electric",
): (number | null)[] {
  return labels.map((label) => {
    const [y, m] = label.split("-");
    const lyKey = `${Number(y) - 1}-${m}`;
    const row = monthly.get(lyKey);
    return row ? Math.round(row[item] * 100) / 100 : null;
  });
}
