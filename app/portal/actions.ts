"use server";

import path from "node:path";
import { put } from "@vercel/blob";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getEmailMap, requireAdminAction } from "@/lib/auth";
import { execute, getPool, query } from "@/lib/db";
import { getAllPeople, getBillTypeByName, billFileHref } from "@/lib/bills";
import { emailIdentity, formatLongDate, newBillEmailHtml, reminderEmailHtml } from "@/lib/emails";
import { sendSmtpMail } from "@/lib/mail";
import { RowDataPacket } from "mysql2";

function done(ok: string, path = "/portal"): never {
  revalidatePath(path);
  redirect(`${path}?ok=${encodeURIComponent(ok)}`);
}

function fail(err: string, path = "/portal"): never {
  redirect(`${path}?err=${encodeURIComponent(err)}`);
}

const HOUSEHOLD = "/portal/household";

// ---------------------------------------------------------------------------
// Add bill (used with useActionState so validation errors render inline)
// ---------------------------------------------------------------------------

export interface AddBillState {
  errors: string[];
}

export async function addBill(
  _prev: AddBillState,
  formData: FormData,
): Promise<AddBillState> {
  try {
    await requireAdminAction();
  } catch {
    return { errors: ["Admin access required."] };
  }

  const errors: string[] = [];
  const typeName = String(formData.get("type") ?? "");
  const billDateStr = String(formData.get("date") ?? "");
  const dueDateStr = String(formData.get("due") ?? "");
  const amountStr = String(formData.get("amount") ?? "");
  const file = formData.get("view");

  if (!billDateStr || !typeName || !amountStr || !dueDateStr || !(file instanceof File) || file.size === 0) {
    errors.push("Missing one of: date, type, amount, due, or PDF.");
  }

  const billType = await getBillTypeByName(typeName);
  if (!billType) {
    errors.push("Invalid bill type selected.");
  }

  const amount = Number(amountStr);
  if (!Number.isFinite(amount)) errors.push("Amount must be numeric.");
  else if (amount <= 0) errors.push("Amount must be a positive value.");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(billDateStr)) errors.push("Invalid bill date format. Please use YYYY-MM-DD.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDateStr)) errors.push("Invalid due date format. Please use YYYY-MM-DD.");

  let origName = "";
  let buffer: Buffer | null = null;
  if (file instanceof File && file.size > 0) {
    if (file.size > 5 * 1024 * 1024) errors.push("File is too large. Maximum size is 5MB.");
    origName = path.basename(file.name).replace(/[^A-Za-z0-9.\-_]/g, "");
    if (!origName || origName === "." || origName === "..") {
      errors.push("Invalid filename after sanitization. Please use standard characters.");
    } else if (!origName.toLowerCase().endsWith(".pdf")) {
      errors.push("Filename must end with .pdf.");
    }
    buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.length > 0 && !buffer.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
      errors.push("Invalid file type. Only PDF files are allowed.");
    }
  }

  if (errors.length > 0) return { errors };

  const year = billDateStr.slice(0, 4);
  const total = amount + Number(billType!.processingFee);
  const allPeople = await getAllPeople();
  const cost = allPeople.length > 0 ? Math.round((total / allPeople.length) * 100) / 100 : 0;

  // Blob key mirrors the stored pdf_path so /files/<pdf_path> resolves directly.
  const pdfPath = `${year}/${typeName}/${origName}`;
  try {
    await put(pdfPath, buffer!, {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/pdf",
    });
  } catch (err) {
    console.error("Blob upload failed:", err);
    return { errors: ["Failed to store the PDF. Check BLOB_READ_WRITE_TOKEN and try again."] };
  }

  const result = await execute(
    `INSERT INTO bills (type_id, bill_date, due_date, total, per_person_cost, status, pdf_path)
     VALUES (?, ?, ?, ?, ?, 'unpaid', ?)`,
    [billType!.id, billDateStr, dueDateStr, total, cost, pdfPath],
  );
  const newBillId = result.insertId;

  if (allPeople.length > 0) {
    const placeholders = allPeople.map(() => "(?, ?)").join(", ");
    await execute(
      `INSERT INTO bill_debts (bill_id, person_id) VALUES ${placeholders}`,
      allPeople.flatMap((p) => [newBillId, p.id]),
    );
  }

  // Notify everyone + admin confirmation (same content as the PHP site)
  const id = emailIdentity();
  const emailMap = await getEmailMap();
  const billViewLink = `${id.baseUrl}${billFileHref(pdfPath)}`;
  const sent: Record<string, string> = {};
  for (const person of allPeople) {
    const to = emailMap[person.name];
    if (!to) continue;
    const html = newBillEmailHtml(
      { personName: person.name, item: typeName, total, cost, dueDate: dueDateStr, billViewLink },
      id,
    );
    if (await sendSmtpMail(to, `New Bill Posted: ${typeName}`, html)) {
      sent[person.name] = to;
    }
  }
  const confirmTo = process.env.APP_CONFIRMATION_EMAIL_TO;
  if (confirmTo) {
    const sentList =
      Object.keys(sent).length === 0
        ? "None (or all failed, check logs)"
        : Object.entries(sent)
            .map(([name, email]) => `${name} &lt;${email}&gt;`)
            .join(", ");
    const confBody =
      `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;color:#111827;">` +
      `<h3 style="margin:0 0 8px 0;">Admin Confirmation: New Bill Posted</h3>` +
      `<p style="margin:6px 0 10px 0;color:#374151;"><strong>Item:</strong> ${typeName} &nbsp;|&nbsp; <strong>Total:</strong> $${total.toFixed(2)}</p>` +
      `<p style="margin:6px 0 10px 0;color:#374151;"><strong>Due:</strong> ${formatLongDate(dueDateStr)}</p>` +
      `<p style="margin:6px 0 10px 0;color:#374151;"><strong>Sent to:</strong> ${sentList}</p>` +
      `<hr style="border:none;border-top:1px solid #eef2ff;margin:12px 0;">` +
      `<p style="margin:0;color:#6b7280;font-size:13px;">Original Subject: New Bill Posted: ${typeName}</p>` +
      `</div>`;
    await sendSmtpMail(confirmTo, `Admin Confirmation: New Bill Posted - ${typeName}`, confBody);
  }

  done("New bill successfully added and assigned to all users!");
}

// ---------------------------------------------------------------------------
// Payment checkboxes (auto-save; called programmatically from the client)
// ---------------------------------------------------------------------------

export async function updateOwes(
  billId: number,
  paidPersonIds: number[],
): Promise<{ ok: boolean; status?: string; error?: string }> {
  try {
    await requireAdminAction();
  } catch {
    return { ok: false, error: "Admin access required." };
  }

  const allPeople = await getAllPeople();
  if (allPeople.length === 0) {
    return { ok: false, error: "No users found in the system." };
  }

  const statusRows = await query<RowDataPacket>(
    "SELECT status FROM bills WHERE id = ?",
    [billId],
  );
  if (statusRows.length === 0) return { ok: false, error: `Bill ${billId} not found.` };
  const currentStatus = statusRows[0].status as string;

  const paid = new Set(paidPersonIds.map(Number));
  const conn = await getPool().getConnection();
  let newStatus = currentStatus;
  try {
    await conn.beginTransaction();
    await conn.execute("DELETE FROM bill_debts WHERE bill_id = ?", [billId]);
    const owing = allPeople.filter((p) => !paid.has(p.id));
    if (owing.length > 0) {
      const placeholders = owing.map(() => "(?, ?)").join(", ");
      await conn.execute(
        `INSERT INTO bill_debts (bill_id, person_id) VALUES ${placeholders}`,
        owing.flatMap((p) => [billId, p.id]),
      );
    }
    newStatus = owing.length === 0 ? "paid" : "unpaid";
    if (newStatus !== currentStatus) {
      await conn.execute("UPDATE bills SET status = ? WHERE id = ?", [newStatus, billId]);
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    console.error(`updateOwes failed for bill ${billId}:`, err);
    return { ok: false, error: "Database error updating payment status." };
  } finally {
    conn.release();
  }

  revalidatePath("/portal");
  revalidatePath("/");
  return { ok: true, status: newStatus };
}

// ---------------------------------------------------------------------------
// Per-bill reminder
// ---------------------------------------------------------------------------

export async function sendReminder(formData: FormData): Promise<void> {
  try {
    await requireAdminAction();
  } catch {
    fail("Admin access required.");
  }

  const billId = Number(formData.get("billId"));
  const bills = await query<RowDataPacket>(
    `SELECT b.id, b.due_date AS dueDate, b.total, b.per_person_cost AS perPersonCost,
            t.name AS typeName
     FROM bills b
     JOIN bill_types t ON t.id = b.type_id
     WHERE b.id = ?`,
    [billId],
  );
  const bill = bills[0];
  if (!bill) fail(`Bill ${billId} not found.`);

  const owingRows = await query<RowDataPacket>(
    `SELECT p.name FROM people p
     JOIN bill_debts d ON p.id = d.person_id
     WHERE d.bill_id = ?`,
    [billId],
  );
  const owingNames: string[] = owingRows.map((r) => r.name);

  const due = new Date(`${bill.dueDate}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const intervalDays = today > due ? 0 : Math.round((due.getTime() - today.getTime()) / 86400000);
  const subject =
    intervalDays <= 3
      ? `URGENT: Reminder - ${bill.typeName} Bill Due Soon`
      : `Reminder: ${bill.typeName} Bill Due`;

  const id = emailIdentity();
  const emailMap = await getEmailMap();
  const sentTo: string[] = [];
  for (const personName of owingNames) {
    const to = emailMap[personName];
    if (!to) continue;
    const html = reminderEmailHtml(
      {
        personName,
        item: bill.typeName,
        total: Number(bill.total),
        cost: Number(bill.perPersonCost),
        dueDate: bill.dueDate,
      },
      id,
    );
    if (await sendSmtpMail(to, subject, html)) {
      sentTo.push(`${personName} &lt;${to}&gt;`);
    }
  }

  const confirmTo = process.env.APP_CONFIRMATION_EMAIL_TO;
  if (owingNames.length > 0 && confirmTo) {
    const processed = sentTo.length === 0 ? "None (or all failed, check logs)" : sentTo.join(", ");
    const confirmBody =
      `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial; color:#111827;">` +
      `<h3 style="margin:0 0 8px 0;">Reminder Batch Report</h3>` +
      `<p style="margin:6px 0 10px 0;color:#374151;">Bill: <strong>${bill.typeName}</strong> — Due: <strong>${bill.dueDate}</strong></p>` +
      `<p style="margin:6px 0 10px 0;color:#374151;"><strong>Processed recipients:</strong></p>` +
      `<p style="margin:0 0 8px 0;color:#374151;">${processed}</p>` +
      `<hr style="border:none;border-top:1px solid #eef2ff;margin:12px 0;">` +
      `<p style="margin:0;color:#6b7280;font-size:13px;">Original Subject: ${subject}</p>` +
      `</div>`;
    await sendSmtpMail(confirmTo, `Reminder Batch Processed: ${bill.typeName} due ${bill.dueDate}`, confirmBody);
  }

  done(`Reminders for bill '${bill.typeName}' processed.`);
}

// ---------------------------------------------------------------------------
// People management
// ---------------------------------------------------------------------------

export async function savePerson(formData: FormData): Promise<void> {
  try {
    await requireAdminAction();
  } catch {
    fail("Admin access required.", HOUSEHOLD);
  }

  const action = String(formData.get("person_action") ?? "add");
  const name = String(formData.get("person_name") ?? "").trim();
  // Email doubles as the login identity, so keep it normalized
  const email = String(formData.get("person_email") ?? "").trim().toLowerCase();
  const isAdmin = formData.get("person_is_admin") ? 1 : 0;

  if (!name || !email) fail("Name and email are both required.", HOUSEHOLD);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail("Invalid email address.", HOUSEHOLD);

  try {
    if (action === "add") {
      await execute(
        "INSERT INTO people (name, email, is_admin) VALUES (?, ?, ?)",
        [name, email, isAdmin],
      );
    } else {
      const id = Number(formData.get("person_id"));
      if (!id) fail("Invalid user ID.", HOUSEHOLD);
      await execute(
        "UPDATE people SET name=?, email=?, is_admin=? WHERE id=?",
        [name, email, isAdmin, id],
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    fail(
      /duplicate/i.test(message) ? "That name or email is already in use." : `Database error: ${message}`,
      HOUSEHOLD,
    );
  }

  done(action === "add" ? `User '${name}' added.` : `User '${name}' updated.`, HOUSEHOLD);
}

export async function removePerson(formData: FormData): Promise<void> {
  try {
    await requireAdminAction();
  } catch {
    fail("Admin access required.", HOUSEHOLD);
  }
  const id = Number(formData.get("person_id"));
  if (!id) fail("Invalid user ID.", HOUSEHOLD);
  // No FK cascade on TiDB — clear their outstanding shares explicitly.
  await execute("DELETE FROM bill_debts WHERE person_id = ?", [id]);
  await execute("DELETE FROM people WHERE id = ?", [id]);
  done("User removed.", HOUSEHOLD);
}

// ---------------------------------------------------------------------------
// Bill type management
// ---------------------------------------------------------------------------

export async function saveBillType(formData: FormData): Promise<void> {
  try {
    await requireAdminAction();
  } catch {
    fail("Admin access required.", HOUSEHOLD);
  }

  const action = String(formData.get("billtype_action") ?? "add");
  const name = String(formData.get("billtype_name") ?? "").trim();
  const emoji = String(formData.get("billtype_emoji") ?? "").trim();
  const feeStr = String(formData.get("billtype_fee") ?? "0");
  const fee = Number(feeStr);

  if (!name || !emoji) fail("Name and emoji are required.", HOUSEHOLD);
  if (!Number.isFinite(fee) || fee < 0) {
    fail("Processing fee must be zero or a positive number.", HOUSEHOLD);
  }

  try {
    if (action === "add") {
      await execute(
        "INSERT INTO bill_types (name, emoji, processing_fee) VALUES (?, ?, ?)",
        [name, emoji, fee],
      );
    } else {
      const id = Number(formData.get("billtype_id"));
      if (!id) fail("Invalid bill type ID.", HOUSEHOLD);
      await execute(
        "UPDATE bill_types SET name=?, emoji=?, processing_fee=? WHERE id=?",
        [name, emoji, fee, id],
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    fail(
      /duplicate/i.test(message)
        ? "A bill type with that name already exists."
        : `Database error: ${message}`,
      HOUSEHOLD,
    );
  }

  done(action === "add" ? `Bill type '${name}' added.` : `Bill type '${name}' updated.`, HOUSEHOLD);
}

export async function removeBillType(formData: FormData): Promise<void> {
  try {
    await requireAdminAction();
  } catch {
    fail("Admin access required.", HOUSEHOLD);
  }
  const id = Number(formData.get("billtype_id"));
  if (!id) fail("Invalid bill type ID.", HOUSEHOLD);

  const nameRows = await query<RowDataPacket>(
    "SELECT name FROM bill_types WHERE id = ?",
    [id],
  );
  const name = nameRows[0]?.name;
  if (!name) fail("Bill type not found.", HOUSEHOLD);

  const countRows = await query<RowDataPacket>(
    "SELECT COUNT(*) AS n FROM bills WHERE type_id = ?",
    [id],
  );
  if (Number(countRows[0].n) > 0) {
    fail(`Cannot remove '${name}' — there are existing bills of this type.`, HOUSEHOLD);
  }

  await execute("DELETE FROM bill_types WHERE id = ?", [id]);
  done(`Bill type '${name}' removed.`, HOUSEHOLD);
}

// ---------------------------------------------------------------------------
// Rent configuration
// ---------------------------------------------------------------------------

export async function saveRent(formData: FormData): Promise<void> {
  try {
    await requireAdminAction();
  } catch {
    fail("Admin access required.", HOUSEHOLD);
  }

  const amount = Number(formData.get("rent_amount"));
  const start = String(formData.get("rent_start") ?? "");
  const end = String(formData.get("rent_end") ?? "");

  if (!Number.isFinite(amount) || amount <= 0) {
    fail("Rent amount must be a positive number.", HOUSEHOLD);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    fail("Valid start and end dates are required.", HOUSEHOLD);
  }
  if (end <= start) fail("End date must be after start date.", HOUSEHOLD);

  const existing = await query<RowDataPacket>("SELECT id FROM rent_config LIMIT 1");
  if (existing.length > 0) {
    await execute(
      "UPDATE rent_config SET monthly_rent = ?, lease_start = ?, lease_end = ? WHERE id = ?",
      [amount, start, end, existing[0].id],
    );
  } else {
    await execute(
      "INSERT INTO rent_config (monthly_rent, lease_start, lease_end) VALUES (?, ?, ?)",
      [amount, start, end],
    );
  }

  done("Rent configuration updated.", HOUSEHOLD);
}

// ---------------------------------------------------------------------------
// Reminder schedule (drives the hourly cron endpoint, api/cron/reminders)
// ---------------------------------------------------------------------------

export async function saveReminderConfig(formData: FormData): Promise<void> {
  try {
    await requireAdminAction();
  } catch {
    fail("Admin access required.", HOUSEHOLD);
  }

  const enabled = formData.get("enabled") === "on" ? 1 : 0;
  const sendHour = Number(formData.get("send_hour"));
  const firstDays = Number(formData.get("first_days"));
  const urgentDays = Number(formData.get("urgent_days"));

  if (!Number.isInteger(sendHour) || sendHour < 0 || sendHour > 23) {
    fail("Send hour must be between 0 and 23.", HOUSEHOLD);
  }
  if (!Number.isInteger(firstDays) || firstDays < 1 || firstDays > 30) {
    fail("Heads-up reminder must be 1–30 days before due.", HOUSEHOLD);
  }
  if (!Number.isInteger(urgentDays) || urgentDays < 0 || urgentDays > 30) {
    fail("Urgent reminder window must be 0–30 days.", HOUSEHOLD);
  }
  if (urgentDays >= firstDays) {
    fail("The urgent window must be smaller than the heads-up day.", HOUSEHOLD);
  }

  const existing = await query<RowDataPacket>(
    "SELECT id FROM reminder_config ORDER BY id DESC LIMIT 1",
  );
  if (existing.length > 0) {
    await execute(
      `UPDATE reminder_config
       SET enabled = ?, send_hour = ?, first_reminder_days = ?, urgent_reminder_days = ?
       WHERE id = ?`,
      [enabled, sendHour, firstDays, urgentDays, existing[0].id],
    );
  } else {
    await execute(
      `INSERT INTO reminder_config (enabled, send_hour, first_reminder_days, urgent_reminder_days)
       VALUES (?, ?, ?, ?)`,
      [enabled, sendHour, firstDays, urgentDays],
    );
  }

  done("Reminder schedule saved.", HOUSEHOLD);
}
