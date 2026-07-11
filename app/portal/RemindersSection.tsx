import { ReminderConfig } from "@/lib/reminders";
import { saveReminderConfig } from "@/app/portal/actions";

const HOURS = Array.from({ length: 24 }, (_, h) => ({
  value: h,
  label:
    h === 0 ? "12:00 AM" : h < 12 ? `${h}:00 AM` : h === 12 ? "12:00 PM" : `${h - 12}:00 PM`,
}));

/** UTC 'YYYY-MM-DD HH:MM:SS' from the DB → 'Jul 10, 9:07 AM ET'. */
function formatEt(utc: string): string {
  const d = new Date(utc.replace(" ", "T") + "Z");
  return (
    d.toLocaleString("en-US", {
      timeZone: "America/New_York",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }) + " ET"
  );
}

/** True when the hourly cron hasn't checked in for over two hours. */
function isStale(lastRunAt: string | null): boolean {
  if (!lastRunAt) return true;
  return Date.now() - Date.parse(lastRunAt.replace(" ", "T") + "Z") > 2 * 3600_000;
}

export default function RemindersSection({ config }: { config: ReminderConfig | null }) {
  const stale = isStale(config?.lastRunAt ?? null);

  return (
    <section className="mt-8">
      <div className="mb-2 flex items-center gap-3">
        <span className="eyebrow">Reminder schedule</span>
        <span className="h-px flex-1 bg-line-soft" aria-hidden="true" />
      </div>
      <div className="panel p-5">
        <form action={saveReminderConfig}>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="field-label" htmlFor="send_hour">
                Send time (ET)
              </label>
              <select
                className="field-input figure"
                id="send_hour"
                name="send_hour"
                defaultValue={config?.sendHour ?? 9}
              >
                {HOURS.map((h) => (
                  <option key={h.value} value={h.value}>
                    {h.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="first_days">
                Heads-up (days before due)
              </label>
              <input
                className="field-input figure"
                type="number"
                id="first_days"
                name="first_days"
                min="1"
                max="30"
                defaultValue={config?.firstReminderDays ?? 7}
                required
              />
            </div>
            <div>
              <label className="field-label" htmlFor="urgent_days">
                Urgent (days out or fewer)
              </label>
              <input
                className="field-input figure"
                type="number"
                id="urgent_days"
                name="urgent_days"
                min="0"
                max="30"
                defaultValue={config?.urgentReminderDays ?? 3}
                required
              />
            </div>
          </div>

          <label className="mt-4 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={config?.enabled ?? true}
              className="h-4 w-4 accent-(--accent)"
            />
            Reminders enabled
          </label>

          <p className="mt-3 text-xs text-ink-muted">
            Heads-up email lands exactly that many days before due; urgent emails repeat
            daily from the urgent window until paid, including overdue. At most one batch
            per day.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button type="submit" className="btn btn-primary">
              Save schedule
            </button>
          </div>
        </form>

        <div className="mt-5 grid gap-4 border-t border-line-soft pt-4 sm:grid-cols-2">
          <div>
            <span className="eyebrow mb-1">Last cron check-in</span>
            <div className="figure text-sm">
              {config?.lastRunAt ? formatEt(config.lastRunAt) : "never"}
              {stale && (
                <span className="tag ml-2 bg-warn-soft text-warn">
                  {config?.lastRunAt ? "stale" : "waiting"}
                </span>
              )}
            </div>
          </div>
          <div>
            <span className="eyebrow mb-1">Last batch sent</span>
            <div className="figure text-sm">
              {config?.lastSentAt
                ? `${formatEt(config.lastSentAt)} (${config.lastSentCount} email${config.lastSentCount === 1 ? "" : "s"})`
                : "no reminders sent yet"}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
