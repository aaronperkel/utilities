import { RowDataPacket } from "mysql2";
import { requireAdmin } from "@/lib/auth";
import { query } from "@/lib/db";
import { getBillTypes, getRentConfig } from "@/lib/bills";
import { getReminderConfig } from "@/lib/reminders";
import PortalTabs from "@/app/portal/PortalTabs";
import BillTypesSection from "@/app/portal/BillTypesSection";
import RemindersSection from "@/app/portal/RemindersSection";
import UsersSection, { PersonDetail } from "@/app/portal/UsersSection";
import { saveRent } from "@/app/portal/actions";

function money(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatMonthYear(ymd: string): string {
  const [y, m] = ymd.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export default async function HouseholdPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; err?: string }>;
}) {
  const { ok, err } = await searchParams;

  // Single round-trip wave; requireAdmin's redirect throws on failure and the
  // fetched data is discarded unrendered.
  const [, billTypes, rentConfig, reminderConfig, peopleDetails] = await Promise.all([
    requireAdmin(),
    getBillTypes(),
    getRentConfig(),
    getReminderConfig(),
    query<RowDataPacket>(
      "SELECT id, name, email, is_admin AS isAdmin FROM people ORDER BY name ASC",
    ),
  ]);

  return (
    <main>
      <PortalTabs active="household" />

      {err && <div className="flash flash-err">{err}</div>}
      {ok && <div className="flash flash-ok">{ok}</div>}

      <UsersSection people={peopleDetails as unknown as PersonDetail[]} />

      <BillTypesSection
        billTypes={billTypes.map((t) => ({
          id: t.id,
          name: t.name,
          emoji: t.emoji,
          processingFee: Number(t.processingFee),
        }))}
      />

      <section className="mt-8">
        <div className="mb-2 flex items-center gap-3">
          <span className="eyebrow">Rent</span>
          <span className="h-px flex-1 bg-line-soft" aria-hidden="true" />
        </div>
        <div className="panel p-5">
          <form action={saveRent}>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="field-label" htmlFor="rent_amount">
                  Monthly rent
                </label>
                <input
                  className="field-input figure"
                  type="number"
                  id="rent_amount"
                  name="rent_amount"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  defaultValue={rentConfig ? Number(rentConfig.monthlyRent).toFixed(2) : ""}
                  required
                />
              </div>
              <div>
                <label className="field-label" htmlFor="rent_start">
                  Lease start
                </label>
                <input
                  className="field-input figure"
                  type="date"
                  id="rent_start"
                  name="rent_start"
                  defaultValue={rentConfig?.leaseStart ?? ""}
                  required
                />
              </div>
              <div>
                <label className="field-label" htmlFor="rent_end">
                  Lease end
                </label>
                <input
                  className="field-input figure"
                  type="date"
                  id="rent_end"
                  name="rent_end"
                  defaultValue={rentConfig?.leaseEnd ?? ""}
                  required
                />
              </div>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button type="submit" className="btn btn-primary">
                Save rent
              </button>
              {rentConfig && (
                <span className="figure text-sm text-ink-muted">
                  Current: ${money(Number(rentConfig.monthlyRent))}/mo (
                  {formatMonthYear(rentConfig.leaseStart)} – {formatMonthYear(rentConfig.leaseEnd)})
                </span>
              )}
            </div>
          </form>
        </div>
      </section>

      <RemindersSection config={reminderConfig} />
    </main>
  );
}
