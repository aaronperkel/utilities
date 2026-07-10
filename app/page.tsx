import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import {
  Bill,
  billFileHref,
  getBillsForPage,
  getTotalBillCount,
  getUserOwedAmount,
  getUserOwedBillIds,
} from "@/lib/bills";
import DueChip from "@/app/components/DueChip";
import Pagination from "@/app/components/Pagination";
import { DownloadIcon, EyeIcon } from "@/app/components/icons";

function formatBillDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
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
  let currentPage = Math.max(1, Number(page ?? 1) || 1);

  const [owedAmount, owedBillIds, totalBills] = await Promise.all([
    getUserOwedAmount(person.id),
    getUserOwedBillIds(person.id),
    getTotalBillCount(),
  ]);

  const totalPages = totalBills > 0 ? Math.ceil(totalBills / billsPerPage) : 1;
  if (currentPage > totalPages && totalBills > 0) redirect(`/?page=${totalPages}`);

  const bills = await getBillsForPage(billsPerPage, (currentPage - 1) * billsPerPage);
  const billsByYear = groupBillsByYear(bills);

  return (
    <main>
      <div className="card mb-8 flex flex-wrap items-center justify-between gap-6 px-6 py-5">
        <div>
          <h2 className="text-lg font-bold">Welcome, {person.name}</h2>
          <p className="text-ink-muted text-sm">Your current outstanding balance</p>
        </div>
        <div className="text-right">
          <div className="text-4xl font-extrabold">${money(owedAmount)}</div>
          <div className="mt-3 flex justify-end gap-2">
            <Link href="/trends" className="btn btn-primary btn-sm">
              View Trends
            </Link>
          </div>
        </div>
      </div>

      <h2 className="section-title">Utility Bills</h2>

      {bills.length === 0 ? (
        <p>No bills found for this page or no bills available.</p>
      ) : (
        billsByYear.map(([year, yearBills]) => (
          <section key={year}>
            <h3 className="mt-7 mb-3 text-base font-semibold">{year}</h3>
            <div className="card overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Bill</th>
                    <th>Amount</th>
                    <th>Due</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {yearBills.map((bill) => {
                    const owedByMe =
                      bill.status !== "paid" && owedBillIds.has(bill.id);
                    const fileHref = bill.pdfPath ? billFileHref(bill.pdfPath) : null;
                    return (
                      <tr key={bill.id}>
                        <td>
                          <div className="font-semibold">
                            {bill.typeEmoji} {bill.typeName}
                          </div>
                          <div className="text-xs text-ink-muted">
                            {formatBillDate(bill.billDate)}
                          </div>
                        </td>
                        <td>
                          <div className="font-semibold">${money(Number(bill.total))}</div>
                          <div className="text-xs text-ink-muted">
                            ${money(Number(bill.perPersonCost))} / person
                          </div>
                        </td>
                        <td>
                          <DueChip due={bill.dueDate} paid={!owedByMe} />
                        </td>
                        <td>
                          {owedByMe ? (
                            <span className="badge badge-unpaid" aria-label="Unpaid by you">
                              Unpaid
                            </span>
                          ) : (
                            <span className="badge badge-paid" aria-label="Paid by you">
                              Paid
                            </span>
                          )}
                        </td>
                        <td>
                          {fileHref ? (
                            <div className="flex gap-1.5">
                              <a href={fileHref} target="_blank" className="btn-icon" title="View bill" aria-label={`View bill ${bill.id}`}>
                                <EyeIcon />
                              </a>
                              <a href={fileHref} download className="btn-icon" title="Download bill" aria-label={`Download bill ${bill.id}`}>
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

      <div className="mt-6 flex flex-wrap gap-2">
        <a href="/trends/csv" className="btn btn-outline btn-sm">
          Export CSV
        </a>
        <a href="webcal://utilities.aaronperkel.com/cal.ics" className="btn btn-outline btn-sm">
          Add to iCal
        </a>
      </div>
    </main>
  );
}
