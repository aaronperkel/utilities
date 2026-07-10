import { redirect } from "next/navigation";
import { RowDataPacket } from "mysql2";
import { requireAdmin } from "@/lib/auth";
import { query } from "@/lib/db";
import {
  billFileHref,
  getBillsForPage,
  getBillTypes,
  getOwedAmounts,
  getTotalBillCount,
} from "@/lib/bills";
import DueChip from "@/app/components/DueChip";
import Pagination from "@/app/components/Pagination";
import { DownloadIcon, EyeIcon } from "@/app/components/icons";
import PortalTabs from "@/app/portal/PortalTabs";
import AddBillForm from "@/app/portal/AddBillForm";
import PaymentCheckboxes from "@/app/portal/PaymentCheckboxes";
import ReminderButton from "@/app/portal/ReminderButton";

function money(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDayMonth(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function PortalPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; ok?: string; err?: string }>;
}) {
  await requireAdmin();
  const { page, ok, err } = await searchParams;

  const billsPerPage = Number(process.env.APP_BILLS_PER_PAGE ?? 10);
  const currentPage = Math.max(1, Number(page ?? 1) || 1);

  const [billTypes, owedAmounts, totalBills] = await Promise.all([
    getBillTypes(),
    getOwedAmounts(),
    getTotalBillCount(),
  ]);

  const peopleRows = await query<RowDataPacket>(
    "SELECT id, name FROM people ORDER BY name ASC",
  );
  const allPeople = peopleRows.map((p) => ({ id: Number(p.id), name: String(p.name) }));

  const totalPages = totalBills > 0 ? Math.ceil(totalBills / billsPerPage) : 1;
  if (currentPage > totalPages && totalBills > 0) redirect(`/portal?page=${totalPages}`);

  const bills = await getBillsForPage(billsPerPage, (currentPage - 1) * billsPerPage);

  // One query for "who still owes" across every bill on this page
  const owingByBill = new Map<number, Set<number>>();
  if (bills.length > 0) {
    const ids = bills.map((b) => b.id);
    const owes = await query<RowDataPacket>(
      `SELECT bill_id AS billId, person_id AS personId
       FROM bill_debts WHERE bill_id IN (${ids.map(() => "?").join(",")})`,
      ids,
    );
    for (const row of owes) {
      const billId = Number(row.billId);
      if (!owingByBill.has(billId)) owingByBill.set(billId, new Set());
      owingByBill.get(billId)!.add(Number(row.personId));
    }
  }

  return (
    <main>
      <PortalTabs active="bills" />

      {err && <div className="flash flash-err">{err}</div>}
      {ok && <div className="flash flash-ok">{ok}</div>}

      {owedAmounts.length > 0 && (
        <section className="mb-7">
          <div className="mb-2 flex items-center gap-3">
            <span className="eyebrow">Outstanding balances</span>
            <span className="h-px flex-1 bg-line-soft" aria-hidden="true" />
          </div>
          <div className="panel grid grid-cols-2 sm:flex sm:divide-x sm:divide-line-soft">
            {owedAmounts.map(({ name, amount }) => (
              <div key={name} className="px-5 py-3 sm:flex-1">
                <span className="eyebrow mb-0.5">{name}</span>
                <div className="figure font-semibold text-unpaid">${money(amount)}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      <AddBillForm
        billTypes={billTypes.map((t) => ({
          name: t.name,
          emoji: t.emoji,
          processingFee: Number(t.processingFee),
        }))}
        peopleCount={allPeople.length}
      />

      <div className="panel overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Bill</th>
              <th>Due</th>
              <th>Status</th>
              <th>Paid by</th>
              <th className="num">Amount</th>
              <th className="num">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {bills.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center text-ink-muted">
                  No bills on this page.
                </td>
              </tr>
            ) : (
              bills.map((bill) => {
                const owing = owingByBill.get(bill.id) ?? new Set<number>();
                const paidIds = allPeople
                  .filter((p) => bill.status === "paid" || !owing.has(p.id))
                  .map((p) => p.id);
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
                      <DueChip due={bill.dueDate} paid={bill.status === "paid"} />
                    </td>
                    <td>
                      <span className={`tag ${bill.status === "paid" ? "tag-paid" : "tag-unpaid"}`}>
                        {bill.status === "paid" ? "Paid" : "Unpaid"}
                      </span>
                    </td>
                    <td>
                      {allPeople.length > 0 ? (
                        <PaymentCheckboxes
                          billId={bill.id}
                          people={allPeople}
                          initialPaidIds={paidIds}
                        />
                      ) : (
                        "N/A"
                      )}
                    </td>
                    <td className="num">
                      <div className="figure font-medium">${money(Number(bill.total))}</div>
                      <div className="figure text-xs text-ink-muted">
                        ${money(Number(bill.perPersonCost))} ea
                      </div>
                    </td>
                    <td className="num">
                      <div className="flex justify-end gap-1.5">
                        {fileHref && (
                          <>
                            <a href={fileHref} target="_blank" className="btn-icon" title="View bill">
                              <EyeIcon />
                            </a>
                            <a href={fileHref} download className="btn-icon" title="Download bill">
                              <DownloadIcon />
                            </a>
                          </>
                        )}
                        {bill.status !== "paid" && <ReminderButton billId={bill.id} />}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Pagination currentPage={currentPage} totalPages={totalPages} basePath="/portal" />
    </main>
  );
}
