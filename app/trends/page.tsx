import { RowDataPacket } from "mysql2";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { billEmoji, getEmojiMap } from "@/lib/bills";
import { getMonthlyTotals, lastYearSeries } from "@/lib/trends";
import TrendsChart from "@/app/trends/TrendsChart";

const BILL_ITEMS = ["Gas", "Electric", "Internet"] as const;

function money(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default async function TrendsPage() {
  await requireUser();

  const emojiMap = await getEmojiMap();
  const { labels: allLabels, monthly } = await getMonthlyTotals();

  // Chart: last 12 months + same-month-last-year overlay
  const labels = allLabels.slice(-12);
  const gas = labels.map((m) => Math.round((monthly.get(m)?.Gas ?? 0) * 100) / 100);
  const elec = labels.map((m) => Math.round((monthly.get(m)?.Electric ?? 0) * 100) / 100);
  const gasLY = lastYearSeries(labels, monthly, "Gas");
  const elecLY = lastYearSeries(labels, monthly, "Electric");

  // This time last year
  const now = new Date();
  const lastYearMonth = `${now.getFullYear() - 1}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const lastYearRows = await query<RowDataPacket>(
    `SELECT t.name AS typeName, SUM(b.total) AS total
     FROM bills b
     JOIN bill_types t ON t.id = b.type_id
     WHERE DATE_FORMAT(b.bill_date, '%Y-%m') = ? AND t.name IN ('Gas','Electric','Internet')
     GROUP BY typeName`,
    [lastYearMonth],
  );
  const lastYearTotals: Record<string, number | null> = {
    Gas: null,
    Electric: null,
    Internet: null,
  };
  for (const r of lastYearRows) lastYearTotals[r.typeName] = Number(r.total);

  // YTD totals
  const ytdRows = await query<RowDataPacket>(
    `SELECT t.name AS typeName, SUM(b.total) AS total
     FROM bills b
     JOIN bill_types t ON t.id = b.type_id
     WHERE YEAR(b.bill_date) = YEAR(CURDATE())
     GROUP BY typeName`,
  );
  const ytdByItem: Record<string, number> = {};
  for (const r of ytdRows) ytdByItem[r.typeName] = Number(r.total);

  // All-time totals since move-in
  const allTimeRows = await query<RowDataPacket>(
    `SELECT t.name AS typeName, SUM(b.total) AS total, MIN(b.bill_date) AS firstBill
     FROM bills b
     JOIN bill_types t ON t.id = b.type_id
     GROUP BY typeName`,
  );
  const allTimeByItem: Record<string, number> = {};
  let allTimeGrand = 0;
  let moveInDate: string | null = null;
  for (const r of allTimeRows) {
    allTimeByItem[r.typeName] = Number(r.total);
    allTimeGrand += Number(r.total);
    const first = r.firstBill as string | null;
    if (first && (!moveInDate || first < moveInDate)) moveInDate = first;
  }
  const moveInYear = moveInDate ? moveInDate.slice(0, 4) : null;

  const insightColumn = (
    title: string,
    values: Record<string, number | null | undefined>,
    totalRow?: number,
  ) => (
    <div className="px-5 py-4">
      <span className="eyebrow mb-2">{title}</span>
      <ul className="space-y-1.5 text-sm">
        {BILL_ITEMS.map((item) => {
          const v = values[item];
          return (
            <li key={item} className="flex items-center justify-between">
              <span>
                {billEmoji(emojiMap, item)} {item}
              </span>
              <span className="figure font-medium">
                {typeof v === "number" ? `$${money(v)}` : "—"}
              </span>
            </li>
          );
        })}
        {totalRow !== undefined && (
          <li className="mt-2 flex items-center justify-between border-t border-line-soft pt-2">
            <span>Total</span>
            <span className="figure font-semibold">${money(totalRow)}</span>
          </li>
        )}
      </ul>
    </div>
  );

  return (
    <main>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Trends</h1>
          <p className="text-sm text-ink-muted">
            Monthly gas &amp; electric costs, with last year dashed for comparison.
          </p>
        </div>
        <a href="/trends/csv" className="btn btn-sm">
          Export CSV
        </a>
      </div>

      <div className="panel p-5">
        <div className="h-[340px]">
          <TrendsChart rawLabels={labels} gas={gas} elec={elec} gasLY={gasLY} elecLY={elecLY} />
        </div>
      </div>

      <div className="panel mt-6 grid divide-y divide-line-soft sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {insightColumn(`${now.getFullYear()} year to date`, ytdByItem)}
        {insightColumn(
          `Since move-in${moveInYear ? ` (${moveInYear})` : ""}`,
          allTimeByItem,
          allTimeGrand,
        )}
        {insightColumn("This time last year", lastYearTotals)}
      </div>
    </main>
  );
}
