import { RowDataPacket } from "mysql2";
import { query } from "@/lib/db";

export interface MonthlyTotals {
  labels: string[]; // 'YYYY-MM'
  monthly: Map<string, { Gas: number | null; Electric: number | null }>;
}

/** Monthly Gas/Electric totals for all history, pivoted by month. */
export async function getMonthlyTotals(): Promise<MonthlyTotals> {
  const rows = await query<RowDataPacket>(
    `SELECT DATE_FORMAT(b.bill_date, '%Y-%m') AS month, t.name AS typeName, SUM(b.total) AS total
     FROM bills b
     JOIN bill_types t ON t.id = b.type_id
     WHERE t.name IN ('Gas','Electric')
     GROUP BY month, typeName
     ORDER BY month`,
  );
  const monthly: MonthlyTotals["monthly"] = new Map();
  for (const r of rows) {
    const m = r.month as string;
    // Seeded null, not 0: a month with only an electric bill has no gas *data*,
    // and a 0 there would plot as a real $0 statement dragging the line to the axis.
    if (!monthly.has(m)) monthly.set(m, { Gas: null, Electric: null });
    monthly.get(m)![r.typeName as "Gas" | "Electric"] = Number(r.total);
  }
  return { labels: [...monthly.keys()], monthly };
}

/** A month's total for one item, rounded to cents; null when there was no bill. */
export function monthValue(
  monthly: MonthlyTotals["monthly"],
  label: string,
  item: "Gas" | "Electric",
): number | null {
  const v = monthly.get(label)?.[item];
  return v == null ? null : Math.round(v * 100) / 100;
}

/** Same-month-last-year series for an ordered list of 'YYYY-MM' labels. */
export function lastYearSeries(
  labels: string[],
  monthly: MonthlyTotals["monthly"],
  item: "Gas" | "Electric",
): (number | null)[] {
  return labels.map((label) => {
    const [y, m] = label.split("-");
    return monthValue(monthly, `${Number(y) - 1}-${m}`, item);
  });
}
