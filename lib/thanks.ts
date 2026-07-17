// Debounced "thanks for your payment" receipts. Marking a person paid
// (updateOwes) queues a payment_thanks row instead of emailing immediately;
// unchecking deletes it. A person's queue is flushed as ONE email only after
// their newest row has aged THANKS_DELAY_MINUTES — the delay is the undo
// window for misclicks, and the newest-row rule collapses a burst of
// payments (several bills checked off together) into a single message.
// Flush callers: the hourly cron endpoint (app/api/cron/reminders) and,
// via after(), any portal payment edit. Relative imports (not @/) so tsx
// scripts outside Next can use this too.
import { RowDataPacket } from "mysql2";
import { execute, getPool, query } from "./db";
import { emailIdentity, paymentThanksEmailHtml } from "./emails";
import { sendSmtpMail } from "./mail";

export const THANKS_DELAY_MINUTES = 10;

export interface ThanksFlushResult {
  sent: number;
  failed: number;
  pending: number; // rows still waiting out their debounce window
}

/**
 * Send the thank-you email for every person whose queue has settled (newest
 * row at least THANKS_DELAY_MINUTES old), then delete their rows. Safe to
 * call from concurrent flushers: rows are claimed with a guarded DELETE and
 * only the claimant sends. Returns zeros if the table doesn't exist yet.
 */
export async function flushThanksQueue(): Promise<ThanksFlushResult> {
  let duePeople: RowDataPacket[];
  try {
    duePeople = await query<RowDataPacket>(
      `SELECT person_id AS personId, MAX(queued_at) AS newestQueuedAt
       FROM payment_thanks
       GROUP BY person_id
       HAVING MAX(queued_at) <= UTC_TIMESTAMP() - INTERVAL ${THANKS_DELAY_MINUTES} MINUTE`,
    );
  } catch (err) {
    console.error("flushThanksQueue: payment_thanks table unavailable:", err);
    return { sent: 0, failed: 0, pending: 0 };
  }

  const id = emailIdentity();
  let sent = 0;
  let failed = 0;

  for (const due of duePeople) {
    const personId = Number(due.personId);
    const rows = await query<RowDataPacket>(
      `SELECT pt.bill_id AS billId, pt.queued_at AS queuedAt,
              p.name AS personName, p.email,
              t.name AS item, b.due_date AS dueDate, b.per_person_cost AS cost
       FROM payment_thanks pt
       JOIN people p ON p.id = pt.person_id
       JOIN bills b ON b.id = pt.bill_id
       JOIN bill_types t ON t.id = b.type_id
       WHERE pt.person_id = ?
       ORDER BY b.due_date`,
      [personId],
    );

    // Claim the rows we just read: the queued_at bound spares anything queued
    // since (its debounce is still running), and affectedRows = 0 means a
    // concurrent flusher beat us to these — theirs to send.
    const claim = await execute(
      "DELETE FROM payment_thanks WHERE person_id = ? AND queued_at <= ?",
      [personId, due.newestQueuedAt],
    );
    if (claim.affectedRows === 0) continue;
    // Rows whose bill or person has vanished fail the JOIN; the claim above
    // still cleared them, which is all the cleanup they need.
    if (rows.length === 0) continue;

    const email = rows[0].email as string;
    const items = rows.map((r) => r.item as string);
    const html = paymentThanksEmailHtml(
      {
        personName: rows[0].personName,
        bills: rows.map((r) => ({
          item: r.item,
          dueDate: r.dueDate,
          cost: Number(r.cost),
        })),
      },
      id,
    );
    if (await sendSmtpMail(email, `Payment Received: ${items.join(", ")}`, html)) {
      console.log(`flushThanksQueue: thanked ${rows[0].personName} <${email}> for ${items.join(", ")}`);
      sent++;
    } else {
      failed++;
      // Put the claimed rows back (original timestamps → due again on the
      // next flush) so a transient SMTP failure doesn't eat the receipt.
      const placeholders = rows.map(() => "(?, ?, ?)").join(", ");
      await execute(
        `INSERT INTO payment_thanks (bill_id, person_id, queued_at) VALUES ${placeholders}
         ON DUPLICATE KEY UPDATE queued_at = queued_at`,
        rows.flatMap((r) => [r.billId, personId, r.queuedAt]),
      );
    }
  }

  const remaining = await query<RowDataPacket>(
    "SELECT COUNT(*) AS n FROM payment_thanks",
  );
  return { sent, failed, pending: Number(remaining[0].n) };
}

/** Queue receipts (inside updateOwes' transaction) for people newly paid. */
export async function queueThanks(
  conn: Awaited<ReturnType<ReturnType<typeof getPool>["getConnection"]>>,
  billId: number,
  personIds: number[],
): Promise<void> {
  if (personIds.length === 0) return;
  const placeholders = personIds.map(() => "(?, ?, UTC_TIMESTAMP())").join(", ");
  await conn.execute(
    `INSERT INTO payment_thanks (bill_id, person_id, queued_at) VALUES ${placeholders}
     ON DUPLICATE KEY UPDATE queued_at = UTC_TIMESTAMP()`,
    personIds.flatMap((pid) => [billId, pid]),
  );
}

/** Cancel queued receipts (inside updateOwes' transaction) for people unchecked. */
export async function cancelThanks(
  conn: Awaited<ReturnType<ReturnType<typeof getPool>["getConnection"]>>,
  billId: number,
  personIds: number[],
): Promise<void> {
  if (personIds.length === 0) return;
  const placeholders = personIds.map(() => "?").join(", ");
  await conn.execute(
    `DELETE FROM payment_thanks WHERE bill_id = ? AND person_id IN (${placeholders})`,
    [billId, ...personIds],
  );
}
