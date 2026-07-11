// Shared reminder engine: used by the hourly cron endpoint
// (app/api/cron/reminders) and the manual CLI (scripts/send-reminders.ts).
// Relative imports (not @/) so tsx can run the CLI outside Next.
import { RowDataPacket } from "mysql2";
import { execute, query } from "./db";
import { emailIdentity, reminderEmailHtml } from "./emails";
import { sendSmtpMail } from "./mail";

const NY_TZ = "America/New_York";

/** Current hour (0-23) in apartment-local time, regardless of server TZ. */
export function nyHour(d = new Date()): number {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: NY_TZ,
      hour: "2-digit",
      hourCycle: "h23",
    }).format(d),
  );
}

/** Current YYYY-MM-DD in apartment-local time. */
export function nyDate(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: NY_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export interface ReminderConfig {
  enabled: boolean;
  sendHour: number; // 0-23, America/New_York
  firstReminderDays: number; // heads-up at exactly this many days before due
  urgentReminderDays: number; // urgent at ≤ this many days, including overdue
  lastRunAt: string | null; // UTC 'YYYY-MM-DD HH:MM:SS' — last cron check-in
  lastSendDate: string | null; // NY date the batch last executed (dedupe guard)
  lastSentAt: string | null; // UTC — last time reminder emails actually went out
  lastSentCount: number;
}

/** Newest reminder_config row, or null if the table is missing/empty. */
export async function getReminderConfig(): Promise<ReminderConfig | null> {
  try {
    const rows = await query<RowDataPacket>(
      `SELECT enabled, send_hour AS sendHour,
              first_reminder_days AS firstReminderDays,
              urgent_reminder_days AS urgentReminderDays,
              last_run_at AS lastRunAt, last_send_date AS lastSendDate,
              last_sent_at AS lastSentAt, last_sent_count AS lastSentCount
       FROM reminder_config ORDER BY id DESC LIMIT 1`,
    );
    const r = rows[0];
    if (!r) return null;
    return {
      enabled: Boolean(r.enabled),
      sendHour: Number(r.sendHour),
      firstReminderDays: Number(r.firstReminderDays),
      urgentReminderDays: Number(r.urgentReminderDays),
      lastRunAt: r.lastRunAt ?? null,
      lastSendDate: r.lastSendDate ?? null,
      lastSentAt: r.lastSentAt ?? null,
      lastSentCount: Number(r.lastSentCount ?? 0),
    };
  } catch {
    return null;
  }
}

/** Stamp the cron's hourly check-in ("last run" in the portal). */
export async function markReminderRun(): Promise<void> {
  try {
    await execute("UPDATE reminder_config SET last_run_at = UTC_TIMESTAMP()");
  } catch {
    /* table not migrated yet — the endpoint reports this separately */
  }
}

export interface ReminderBatchResult {
  checked: number;
  sent: number;
  failed: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Send reminders for every unpaid bill-person pair that is due in exactly
 * `firstReminderDays` or in ≤ `urgentReminderDays` (including overdue), then
 * email a batch confirmation to APP_CONFIRMATION_EMAIL_TO. Records
 * last_send_date/last_sent_* in reminder_config so the cron endpoint can
 * refuse to double-send within a day.
 */
export async function runReminderBatch(opts: {
  firstReminderDays: number;
  urgentReminderDays: number;
}): Promise<ReminderBatchResult> {
  const id = emailIdentity();
  const confirmTo = process.env.APP_CONFIRMATION_EMAIL_TO ?? "";

  const rows = await query<RowDataPacket>(
    `SELECT
       b.id              AS bill_id,
       b.due_date        AS due_date,
       t.name            AS item,
       b.total           AS total,
       b.per_person_cost AS cost,
       p.name            AS person,
       p.email           AS email
     FROM bills b
     JOIN bill_types t ON t.id = b.type_id
     JOIN bill_debts d  ON b.id = d.bill_id
     JOIN people     p  ON d.person_id = p.id
     WHERE b.status <> 'paid'
     ORDER BY b.due_date, p.name`,
  );

  // Day math anchored to the apartment's calendar date, not the server's
  // (a 9 PM ET send hour is already "tomorrow" in UTC).
  const todayMs = Date.parse(nyDate());
  const sent: { person: string; email: string; item: string }[] = [];
  let failed = 0;

  for (const row of rows) {
    const days = Math.round((Date.parse(row.due_date) - todayMs) / 86400000);
    const label = `${row.item} due ${row.due_date} for ${row.person}: ${days >= 0 ? "+" : ""}${days} day(s)`;

    if (days !== opts.firstReminderDays && days > opts.urgentReminderDays) {
      console.log(`- ${label} — skip`);
      continue;
    }

    const email = row.email as string | null;
    if (!email) {
      console.log(`- ${label} — no email found for ${row.person}`);
      failed++;
      continue;
    }

    const subject =
      days <= opts.urgentReminderDays
        ? `URGENT: Reminder — ${row.item} Bill Due Soon`
        : `Reminder: ${row.item} Bill Due`;
    const html = reminderEmailHtml(
      {
        personName: row.person,
        item: row.item,
        total: Number(row.total),
        cost: Number(row.cost),
        dueDate: row.due_date,
      },
      id,
    );

    if (await sendSmtpMail(email, subject, html)) {
      console.log(`- ${label} — sent to ${email}`);
      sent.push({ person: row.person, email, item: row.item });
    } else {
      console.log(`- ${label} — FAILED`);
      failed++;
    }
    await sleep(1000);
  }

  if (sent.length > 0 && confirmTo) {
    const rowsHtml = sent
      .map(
        (r) => `<tr>
          <td style='padding:6px 12px;border-bottom:1px solid #eef2ff;'>${r.person}</td>
          <td style='padding:6px 12px;border-bottom:1px solid #eef2ff;'>${r.email}</td>
          <td style='padding:6px 12px;border-bottom:1px solid #eef2ff;'>${r.item}</td>
        </tr>`,
      )
      .join("");
    const confirmBody = `<div style="font-family:system-ui,Arial;color:#111827;">
      <h3 style="margin:0 0 12px 0;">Daily Reminder Batch (${sent.length} sent)</h3>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead><tr style="background:#f8fafc;">
          <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0;">Name</th>
          <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0;">Email</th>
          <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0;">Bill</th>
        </tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      <p style="margin:16px 0 0;color:#6b7280;font-size:13px;">${id.fromName} — Automated Daily Script</p>
    </div>`;
    await sendSmtpMail(confirmTo, `Daily Reminder Batch (${sent.length} sent)`, confirmBody);
    console.log(`Batch confirmation sent to ${confirmTo}`);
  }

  // Bookkeeping for the portal readout + the once-per-day guard. Best effort:
  // a batch that sent mail but can't record it shouldn't crash the run.
  try {
    if (sent.length > 0) {
      await execute(
        `UPDATE reminder_config
         SET last_send_date = ?, last_sent_at = UTC_TIMESTAMP(), last_sent_count = ?`,
        [nyDate(), sent.length],
      );
    } else {
      await execute("UPDATE reminder_config SET last_send_date = ?", [nyDate()]);
    }
  } catch {
    /* table not migrated yet */
  }

  return { checked: rows.length, sent: sent.length, failed };
}
