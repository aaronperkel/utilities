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
    `SELECT fldItem, SUM(fldTotal) AS total
     FROM tblUtilities
     WHERE DATE_FORMAT(fldDate, '%Y-%m') = ? AND fldItem IN ('Gas','Electric','Internet')
     GROUP BY fldItem`,
    [lastYearMonth],
  );
  const lastYearTotals: Record<string, number | null> = {
    Gas: null,
    Electric: null,
    Internet: null,
  };
  for (const r of lastYearRows) lastYearTotals[r.fldItem] = Number(r.total);

  // YTD totals
  const ytdRows = await query<RowDataPacket>(
    `SELECT fldItem, SUM(fldTotal) AS total
     FROM tblUtilities
     WHERE YEAR(fldDate) = YEAR(CURDATE())
     GROUP BY fldItem`,
  );
  const ytdByItem: Record<string, number> = {};
  for (const r of ytdRows) ytdByItem[r.fldItem] = Number(r.total);

  // All-time totals since move-in
  const allTimeRows = await query<RowDataPacket>(
    `SELECT fldItem, SUM(fldTotal) AS total, MIN(fldDate) AS first_bill
     FROM tblUtilities
     GROUP BY fldItem`,
  );
  const allTimeByItem: Record<string, number> = {};
  let allTimeGrand = 0;
  let moveInDate: string | null = null;
  for (const r of allTimeRows) {
    allTimeByItem[r.fldItem] = Number(r.total);
    allTimeGrand += Number(r.total);
    const first = r.first_bill as string | null;
    if (first && (!moveInDate || first < moveInDate)) moveInDate = first;
  }
  const moveInYear = moveInDate ? moveInDate.slice(0, 4) : null;

  const insightCard = (
    title: string,
    values: Record<string, number | null | undefined>,
    totalRow?: number,
  ) => (
    <div className="card px-6 py-5">
      <h3 className="mb-3 font-semibold">{title}</h3>
      <ul className="space-y-1.5 text-sm">
        {BILL_ITEMS.map((item) => {
          const v = values[item];
          return (
            <li key={item} className="flex items-center justify-between">
              <span>
                {billEmoji(emojiMap, item)} {item}
              </span>
              <strong>{typeof v === "number" ? `$${money(v)}` : "—"}</strong>
            </li>
          );
        })}
        {totalRow !== undefined && (
          <li className="mt-2 flex items-center justify-between border-t border-border-light pt-2">
            <span>Total</span>
            <strong>${money(totalRow)}</strong>
          </li>
        )}
      </ul>
    </div>
  );

  return (
    <main>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="section-title mb-0!">Trends</h2>
        <a href="/trends/csv" className="btn btn-outline btn-sm">
          Export CSV
        </a>
      </div>

      <div className="card p-5">
        <div className="h-[340px]">
          <TrendsChart rawLabels={labels} gas={gas} elec={elec} gasLY={gasLY} elecLY={elecLY} />
        </div>
        <p className="mt-3 text-center text-sm text-ink-muted">
          Monthly Gas &amp; Electric costs — last 12 months.
        </p>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {insightCard(`${now.getFullYear()} Year to Date`, ytdByItem)}
        {insightCard(
          `Since Move-In${moveInYear ? ` (${moveInYear})` : ""}`,
          allTimeByItem,
          allTimeGrand,
        )}
        {insightCard("This Time Last Year", lastYearTotals)}
      </div>
    </main>
  );
}
