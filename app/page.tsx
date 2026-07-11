import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import {
  Bill,
  billFileHref,
  getBillsForPage,
  getTotalBillCount,
  getUserNextDue,
  getUserOwedAmount,
  getUserOwedBillIds,
} from "@/lib/bills";
import DueChip from "@/app/components/DueChip";
import Pagination from "@/app/components/Pagination";
import { DownloadIcon, EyeIcon } from "@/app/components/icons";

function formatDayMonth(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function money(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function groupBillsByYear(bills: Bill[]): [string, Bill[]][] {
  const byYear = new Map<string, Bill[]>();
  for (const bill of bills) {
    const year = bill.billDate.slice(0, 4);
    if (!byYear.has(year)) byYear.set(year, []);
    byYear.get(year)!.push(bill);
  }
  return [...byYear.entries()].sort((a, b) => b[0].localeCompare(a[0]));
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const person = await requireUser();
  const { page } = await searchParams;

  const billsPerPage = Number(process.env.APP_BILLS_PER_PAGE ?? 10);
  const currentPage = Math.max(1, Number(page ?? 1) || 1);

  const [owedAmount, owedBillIds, totalBills, nextDue, bills] = await Promise.all([
    getUserOwedAmount(person.id),
    getUserOwedBillIds(person.id),
    getTotalBillCount(),
    getUserNextDue(person.id),
    getBillsForPage(billsPerPage, (currentPage - 1) * billsPerPage),
  ]);

  const totalPages = totalBills > 0 ? Math.ceil(totalBills / billsPerPage) : 1;
  if (currentPage > totalPages && totalBills > 0) redirect(`/?page=${totalPages}`);

  const billsByYear = groupBillsByYear(bills);

  const today = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <main>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Welcome, {person.name}</h1>
          <p className="text-sm text-ink-muted">Statement as of {today}</p>
        </div>
        <div className="flex gap-2">
          <a href="/trends/csv" className="btn btn-sm">
            Export CSV
          </a>
          <a href="webcal://utilities.aaronperkel.com/cal.ics" className="btn btn-sm">
            iCal feed
          </a>
        </div>
      </div>

      <div className="panel mb-8 grid divide-y divide-line-soft sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <div className="px-5 py-4">
          <span className="eyebrow mb-1">Balance due</span>
          <div className="figure text-[1.7rem] font-semibold leading-tight">
            ${money(owedAmount)}
          </div>
          <div className="mt-0.5 text-xs text-ink-muted">
            {owedBillIds.size > 0
              ? `across ${owedBillIds.size} unpaid ${owedBillIds.size === 1 ? "bill" : "bills"}`
              : "nothing outstanding"}
          </div>
        </div>
        <div className="px-5 py-4">
          <span className="eyebrow mb-1">Next due</span>
          <div className="figure text-[1.7rem] font-semibold leading-tight">
            {nextDue ? formatDayMonth(nextDue.dueDate) : "—"}
          </div>
          <div className="mt-0.5 text-xs text-ink-muted">
            {nextDue ? nextDue.typeName : "no upcoming payments"}
          </div>
        </div>
        <div className="px-5 py-4">
          <span className="eyebrow mb-1">Bills on record</span>
          <div className="figure text-[1.7rem] font-semibold leading-tight">{totalBills}</div>
          <div className="mt-0.5 text-xs text-ink-muted">
            <Link href="/trends" className="text-accent hover:underline">
              view trends →
            </Link>
          </div>
        </div>
      </div>

      {bills.length === 0 ? (
        <div className="panel px-5 py-8 text-center text-sm text-ink-muted">
          No bills on this page.
        </div>
      ) : (
        billsByYear.map(([year, yearBills]) => (
          <section key={year} className="mb-7">
            <div className="mb-2 flex items-center gap-3">
              <span className="eyebrow">{year}</span>
              <span className="h-px flex-1 bg-line-soft" aria-hidden="true" />
            </div>
            <div className="panel overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Bill</th>
                    <th>Due</th>
                    <th>Status</th>
                    <th className="num">Amount</th>
                    <th className="num">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {yearBills.map((bill) => {
                    const owedByMe = bill.status !== "paid" && owedBillIds.has(bill.id);
                    const fileHref = bill.pdfPath ? billFileHref(bill.pdfPath) : null;
                    return (
                      <tr key={bill.id}>
                        <td>
                          <div className="font-medium">
                            {bill.typeEmoji} {bill.typeName}
                          </div>
                          <div className="figure text-xs text-ink-muted">
                            {formatDayMonth(bill.billDate)}
                          </div>
                        </td>
                        <td>
                          <DueChip due={bill.dueDate} paid={!owedByMe} />
                        </td>
                        <td>
                          {owedByMe ? (
                            <span className="tag tag-unpaid" aria-label="Unpaid by you">
                              Unpaid
                            </span>
                          ) : (
                            <span className="tag tag-paid" aria-label="Paid by you">
                              Paid
                            </span>
                          )}
                        </td>
                        <td className="num">
                          <div className="figure font-medium">${money(Number(bill.total))}</div>
                          <div className="figure text-xs text-ink-muted">
                            ${money(Number(bill.perPersonCost))} ea
                          </div>
                        </td>
                        <td className="num">
                          {fileHref ? (
                            <div className="flex justify-end gap-1.5">
                              <a
                                href={fileHref}
                                target="_blank"
                                className="btn-icon"
                                title="View bill"
                                aria-label={`View ${bill.typeName} bill`}
                              >
                                <EyeIcon />
                              </a>
                              <a
                                href={fileHref}
                                download
                                className="btn-icon"
                                title="Download bill"
                                aria-label={`Download ${bill.typeName} bill`}
                              >
                                <DownloadIcon />
                              </a>
                            </div>
                          ) : (
                            <span className="text-ink-muted">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}

      <Pagination currentPage={currentPage} totalPages={totalPages} basePath="/" />
    </main>
  );
}
