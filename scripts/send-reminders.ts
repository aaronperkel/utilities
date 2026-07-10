/**
 * scripts/send-reminders.ts
 *
 * Cron script: queries unpaid bills and sends SMTP email reminders.
 * Sends at exactly 7 days before due, and again at ≤3 days (including overdue).
 * Port of the PHP scripts/send_reminders.php.
 *
 * Run: npm run send-reminders   (or: npx tsx scripts/send-reminders.ts)
 */

// Load env the same way Next does (best effort — fine if files are missing)
for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(new URL(`../${file}`, import.meta.url).pathname);
  } catch {
    /* file not present */
  }
}

import { RowDataPacket } from "mysql2";
import { getPool, query } from "../lib/db";
import { emailIdentity, reminderEmailHtml } from "../lib/emails";
import { sendSmtpMail } from "../lib/mail";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const id = emailIdentity();
  const confirmTo = process.env.APP_CONFIRMATION_EMAIL_TO ?? "";

  console.log("========== Checking Bills ==========");
  console.log("Started:", new Date().toISOString());

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

  if (rows.length === 0) {
    console.log("No unpaid bills found.");
    console.log("Done:", new Date().toISOString());
    return;
  }
  console.log(`Found ${rows.length} unpaid bill-person row(s).`);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sent: { person: string; email: string; item: string }[] = [];
  let failed = 0;

  for (const row of rows) {
    const due = new Date(`${row.due_date}T00:00:00`);
    const days = Math.round((due.getTime() - today.getTime()) / 86400000);

    process.stdout.write(
      `- ${row.item} due ${row.due_date} for ${row.person}: ${days >= 0 ? "+" : ""}${days} day(s)`,
    );

    // Send at exactly 7 days out, and again at 3 days or fewer (including overdue)
    if (days !== 7 && days > 3) {
      console.log(" — skip");
      continue;
    }

    const email = row.email as string | null;
    if (!email) {
      console.log(` — no email found for ${row.person}`);
      failed++;
      continue;
    }

    const subject =
      days <= 3
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
      console.log(` — sent to ${email}`);
      sent.push({ person: row.person, email, item: row.item });
    } else {
      console.log(" — FAILED");
      failed++;
    }
    await sleep(1000);
  }

  console.log("---------- Summary ----------");
  console.log(`Sent: ${sent.length} | Failed: ${failed}`);

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

  console.log("Done:", new Date().toISOString());
  console.log("====================================");
}

main()
  .then(() => getPool().end())
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
