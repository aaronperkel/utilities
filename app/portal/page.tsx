import { redirect } from "next/navigation";
import { RowDataPacket } from "mysql2";
import { requireAdmin } from "@/lib/auth";
import { query } from "@/lib/db";
import {
  billEmoji,
  billFileHref,
  getBillsForPage,
  getBillTypes,
  getEmojiMap,
  getOwedAmounts,
  getRentConfig,
  getTotalBillCount,
} from "@/lib/bills";
import DueChip from "@/app/components/DueChip";
import Pagination from "@/app/components/Pagination";
import { DownloadIcon, EyeIcon } from "@/app/components/icons";
import AddBillForm from "@/app/portal/AddBillForm";
import PaymentCheckboxes from "@/app/portal/PaymentCheckboxes";
import ReminderButton from "@/app/portal/ReminderButton";
import BillTypesSection from "@/app/portal/BillTypesSection";
import UsersSection, { PersonDetail } from "@/app/portal/UsersSection";
import { saveRent } from "@/app/portal/actions";

function money(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatBillDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatMonthYear(ymd: string): string {
  const [y, m] = ymd.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short", year: "numeric" });
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

  const [billTypes, owedAmounts, totalBills, rentConfig, emojiMap] = await Promise.all([
    getBillTypes(),
    getOwedAmounts(),
    getTotalBillCount(),
    getRentConfig(),
    getEmojiMap(),
  ]);

  const peopleDetails = await query<RowDataPacket>(
    "SELECT personID, personName, uid, email, is_admin FROM tblPeople ORDER BY personName ASC",
  );
  const allPeople = peopleDetails.map((p) => ({
    personID: Number(p.personID),
    personName: String(p.personName),
  }));

  const totalPages = totalBills > 0 ? Math.ceil(totalBills / billsPerPage) : 1;
  if (currentPage > totalPages && totalBills > 0) redirect(`/portal?page=${totalPages}`);

  const bills = await getBillsForPage(billsPerPage, (currentPage - 1) * billsPerPage);

  // One query for "who still owes" across every bill on this page
  const owingByBill = new Map<number, Set<number>>();
  if (bills.length > 0) {
    const ids = bills.map((b) => b.pmkBillID);
    const owes = await query<RowDataPacket>(
      `SELECT billID, personID FROM tblBillOwes WHERE billID IN (${ids.map(() => "?").join(",")})`,
      ids,
    );
    for (const row of owes) {
      const billId = Number(row.billID);
      if (!owingByBill.has(billId)) owingByBill.set(billId, new Set());
      owingByBill.get(billId)!.add(Number(row.personID));
    }
  }

  return (
    <main>
      <h2 className="section-title">Admin Portal</h2>

      {err && (
        <div className="mb-5 rounded-(--radius-sm) border border-unpaid/40 bg-unpaid/10 px-4 py-3 text-sm">
          {err}
        </div>
      )}
      {ok && (
        <div className="mb-5 rounded-(--radius-sm) border border-paid/40 bg-paid/10 px-4 py-3 text-sm">
          {ok}
        </div>
      )}

      {owedAmounts.length > 0 && (
        <div className="card mb-6 px-6 py-5">
          <h3 className="mb-3 font-semibold">Who Owes What</h3>
          <ul className="space-y-1.5">
            {owedAmounts.map(({ name, amount }) => (
              <li key={name} className="flex items-center justify-between text-sm">
                <span className="font-semibold">{name}</span>
                <strong className="text-unpaid">${money(amount)}</strong>
              </li>
            ))}
          </ul>
        </div>
      )}

      <section>
        <h2 className="section-title">Add New Bill</h2>
        <AddBillForm
          billTypes={billTypes.map((t) => ({
            typeName: t.typeName,
            typeEmoji: t.typeEmoji,
            processingFee: Number(t.processingFee),
          }))}
          peopleCount={allPeople.length}
        />
      </section>

      <h2 className="section-title">Bills</h2>
      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Bill</th>
              <th>Amount</th>
              <th>Due</th>
              <th>Status</th>
              <th>Paid By</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {bills.length === 0 ? (
              <tr>
                <td colSpan={6}>No bills found for this page.</td>
              </tr>
            ) : (
              bills.map((bill) => {
                const owing = owingByBill.get(bill.pmkBillID) ?? new Set<number>();
                const paidIds = allPeople
                  .filter((p) => bill.fldStatus === "Paid" || !owing.has(p.personID))
                  .map((p) => p.personID);
                const fileHref = billFileHref(bill.fldView);
                return (
                  <tr key={bill.pmkBillID}>
                    <td>
                      <div className="font-semibold">
                        {billEmoji(emojiMap, bill.fldItem)} {bill.fldItem}
                      </div>
                      <div className="text-xs text-ink-muted">{formatBillDate(bill.fldDate)}</div>
                    </td>
                    <td>
                      <div className="font-semibold">${money(Number(bill.fldTotal))}</div>
                      <div className="text-xs text-ink-muted">
                        ${money(Number(bill.fldCost))} / person
                      </div>
                    </td>
                    <td>
                      <DueChip due={bill.fldDue} paid={bill.fldStatus === "Paid"} />
                    </td>
                    <td>
                      <span className={`badge ${bill.fldStatus === "Paid" ? "badge-paid" : "badge-unpaid"}`}>
                        {bill.fldStatus}
                      </span>
                    </td>
                    <td>
                      {allPeople.length > 0 ? (
                        <PaymentCheckboxes
                          billId={bill.pmkBillID}
                          people={allPeople}
                          initialPaidIds={paidIds}
                        />
                      ) : (
                        "N/A"
                      )}
                    </td>
                    <td>
                      <div className="flex gap-1.5">
                        <a href={fileHref} target="_blank" className="btn-icon" title="View bill">
                          <EyeIcon />
                        </a>
                        <a href={fileHref} download className="btn-icon" title="Download bill">
                          <DownloadIcon />
                        </a>
                        {bill.fldStatus !== "Paid" && <ReminderButton billId={bill.pmkBillID} />}
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

      <BillTypesSection
        billTypes={billTypes.map((t) => ({
          typeID: t.typeID,
          typeName: t.typeName,
          typeEmoji: t.typeEmoji,
          processingFee: Number(t.processingFee),
        }))}
      />

      <section className="mt-10">
        <h2 className="section-title">Rent Configuration</h2>
        <div className="form-panel">
          <form action={saveRent}>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="field-label" htmlFor="rent_amount">
                  Monthly Rent
                </label>
                <input
                  className="field-input"
                  type="number"
                  id="rent_amount"
                  name="rent_amount"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  defaultValue={rentConfig ? Number(rentConfig.rentAmount).toFixed(2) : ""}
                  required
                />
              </div>
              <div>
                <label className="field-label" htmlFor="rent_start">
                  Lease Start
                </label>
                <input
                  className="field-input"
                  type="date"
                  id="rent_start"
                  name="rent_start"
                  defaultValue={rentConfig?.startDate ?? ""}
                  required
                />
              </div>
              <div>
                <label className="field-label" htmlFor="rent_end">
                  Lease End
                </label>
                <input
                  className="field-input"
                  type="date"
                  id="rent_end"
                  name="rent_end"
                  defaultValue={rentConfig?.endDate ?? ""}
                  required
                />
              </div>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button type="submit" className="btn btn-primary">
                Save Rent Config
              </button>
              {rentConfig && (
                <span className="text-sm text-ink-muted">
                  Current: ${money(Number(rentConfig.rentAmount))}/mo (
                  {formatMonthYear(rentConfig.startDate)} – {formatMonthYear(rentConfig.endDate)})
                </span>
              )}
            </div>
          </form>
        </div>
      </section>

      <UsersSection people={peopleDetails as unknown as PersonDetail[]} />
    </main>
  );
}
