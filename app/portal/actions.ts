"use server";

import fs from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getEmailMap, requireAdminAction } from "@/lib/auth";
import { execute, getPool, query } from "@/lib/db";
import {
  getAllPeople,
  getBillTypeFee,
  getBillTypes,
  billFileHref,
} from "@/lib/bills";
import { emailIdentity, formatLongDate, newBillEmailHtml, reminderEmailHtml } from "@/lib/emails";
import { sendSmtpMail } from "@/lib/mail";
import { RowDataPacket } from "mysql2";

const BILLS_DIR = process.env.BILLS_DIR ?? path.join(process.cwd(), "bill-pdfs");

function done(ok: string): never {
  revalidatePath("/portal");
  redirect(`/portal?ok=${encodeURIComponent(ok)}`);
}

function fail(err: string): never {
  redirect(`/portal?err=${encodeURIComponent(err)}`);
}

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
  const item = String(formData.get("item") ?? "");
  const billDateStr = String(formData.get("date") ?? "");
  const dueDateStr = String(formData.get("due") ?? "");
  const amountStr = String(formData.get("amount") ?? "");
  const file = formData.get("view");

  if (!billDateStr || !item || !amountStr || !dueDateStr || !(file instanceof File) || file.size === 0) {
    errors.push("Missing one of: date, item, amount, due, or PDF.");
  }

  const billTypes = await getBillTypes();
  if (!billTypes.some((t) => t.typeName === item)) {
    errors.push("Invalid item selected.");
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
  const fee = await getBillTypeFee(item);
  const total = amount + fee;
  const allPeople = await getAllPeople();
  const cost = allPeople.length > 0 ? Math.round((total / allPeople.length) * 100) / 100 : 0;

  // Store the file under bill-pdfs/{year}/{item}/, but keep the legacy
  // "public/..." prefix in fldView so old rows and new rows stay uniform.
  const dir = path.join(BILLS_DIR, year, item);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, origName), buffer!);
  const dbPath = `public/${year}/${item}/${origName}`;

  const result = await execute(
    `INSERT INTO tblUtilities (fldDate, fldItem, fldTotal, fldCost, fldDue, fldStatus, fldView)
     VALUES (?, ?, ?, ?, ?, 'Unpaid', ?)`,
    [billDateStr, item, total, cost, dueDateStr, dbPath],
  );
  const newBillId = result.insertId;

  for (const person of allPeople) {
    await execute("INSERT INTO tblBillOwes (billID, personID) VALUES (?, ?)", [
      newBillId,
      person.personID,
    ]);
  }

  // Notify everyone + admin confirmation (same content as the PHP site)
  const id = emailIdentity();
  const emailMap = await getEmailMap();
  const billViewLink = `${id.baseUrl}${billFileHref(dbPath)}`;
  const sent: Record<string, string> = {};
  for (const person of allPeople) {
    const to = emailMap[person.personName];
    if (!to) continue;
    const html = newBillEmailHtml(
      { personName: person.personName, item, total, cost, dueDate: dueDateStr, billViewLink },
      id,
    );
    if (await sendSmtpMail(to, `New Bill Posted: ${item}`, html)) {
      sent[person.personName] = to;
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
      `<p style="margin:6px 0 10px 0;color:#374151;"><strong>Item:</strong> ${item} &nbsp;|&nbsp; <strong>Total:</strong> $${total.toFixed(2)}</p>` +
      `<p style="margin:6px 0 10px 0;color:#374151;"><strong>Due:</strong> ${formatLongDate(dueDateStr)}</p>` +
      `<p style="margin:6px 0 10px 0;color:#374151;"><strong>Sent to:</strong> ${sentList}</p>` +
      `<hr style="border:none;border-top:1px solid #eef2ff;margin:12px 0;">` +
      `<p style="margin:0;color:#6b7280;font-size:13px;">Original Subject: New Bill Posted: ${item}</p>` +
      `</div>`;
    await sendSmtpMail(confirmTo, `Admin Confirmation: New Bill Posted - ${item}`, confBody);
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
    "SELECT fldStatus FROM tblUtilities WHERE pmkBillID = ?",
    [billId],
  );
  if (statusRows.length === 0) return { ok: false, error: `Bill ${billId} not found.` };
  const currentStatus = statusRows[0].fldStatus as string;

  const paid = new Set(paidPersonIds.map(Number));
  const conn = await getPool().getConnection();
  let newStatus = currentStatus;
  try {
    await conn.beginTransaction();
    await conn.execute("DELETE FROM tblBillOwes WHERE billID = ?", [billId]);
    let owingCount = 0;
    for (const person of allPeople) {
      if (!paid.has(person.personID)) {
        await conn.execute("INSERT INTO tblBillOwes (billID, personID) VALUES (?, ?)", [
          billId,
          person.personID,
        ]);
        owingCount++;
      }
    }
    newStatus = owingCount === 0 ? "Paid" : "Unpaid";
    if (newStatus !== currentStatus) {
      await conn.execute("UPDATE tblUtilities SET fldStatus = ? WHERE pmkBillID = ?", [
        newStatus,
        billId,
      ]);
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
    "SELECT pmkBillID, fldDue, fldItem, fldTotal, fldCost FROM tblUtilities WHERE pmkBillID = ?",
    [billId],
  );
  const bill = bills[0];
  if (!bill) fail(`Bill ${billId} not found.`);

  const owingRows = await query<RowDataPacket>(
    `SELECT p.personName FROM tblPeople p
     JOIN tblBillOwes bo ON p.personID = bo.personID
     WHERE bo.billID = ?`,
    [billId],
  );
  const owingNames: string[] = owingRows.map((r) => r.personName);

  const due = new Date(`${bill.fldDue}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const intervalDays = today > due ? 0 : Math.round((due.getTime() - today.getTime()) / 86400000);
  const subject =
    intervalDays <= 3
      ? `URGENT: Reminder - ${bill.fldItem} Bill Due Soon`
      : `Reminder: ${bill.fldItem} Bill Due`;

  const id = emailIdentity();
  const emailMap = await getEmailMap();
  const sentTo: string[] = [];
  for (const personName of owingNames) {
    const to = emailMap[personName];
    if (!to) continue;
    const html = reminderEmailHtml(
      {
        personName,
        item: bill.fldItem,
        total: Number(bill.fldTotal),
        cost: Number(bill.fldCost),
        dueDate: bill.fldDue,
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
      `<p style="margin:6px 0 10px 0;color:#374151;">Bill: <strong>${bill.fldItem}</strong> — Due: <strong>${bill.fldDue}</strong></p>` +
      `<p style="margin:6px 0 10px 0;color:#374151;"><strong>Processed recipients:</strong></p>` +
      `<p style="margin:0 0 8px 0;color:#374151;">${processed}</p>` +
      `<hr style="border:none;border-top:1px solid #eef2ff;margin:12px 0;">` +
      `<p style="margin:0;color:#6b7280;font-size:13px;">Original Subject: ${subject}</p>` +
      `</div>`;
    await sendSmtpMail(confirmTo, `Reminder Batch Processed: ${bill.fldItem} due ${bill.fldDue}`, confirmBody);
  }

  done(`Reminders for bill '${bill.fldItem}' processed.`);
}

// ---------------------------------------------------------------------------
// People management
// ---------------------------------------------------------------------------

export async function savePerson(formData: FormData): Promise<void> {
  try {
    await requireAdminAction();
  } catch {
    fail("Admin access required.");
  }

  const action = String(formData.get("person_action") ?? "add");
  const name = String(formData.get("person_name") ?? "").trim();
  const uid = String(formData.get("person_uid") ?? "").trim();
  const email = String(formData.get("person_email") ?? "").trim();
  const isAdmin = formData.get("person_is_admin") ? 1 : 0;

  if (!name || !uid || !email) fail("Name, NetID, and email are all required.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail("Invalid email address.");

  try {
    if (action === "add") {
      await execute(
        "INSERT INTO tblPeople (personName, uid, email, is_admin) VALUES (?, ?, ?, ?)",
        [name, uid, email, isAdmin],
      );
    } else {
      const id = Number(formData.get("person_id"));
      if (!id) fail("Invalid user ID.");
      await execute(
        "UPDATE tblPeople SET personName=?, uid=?, email=?, is_admin=? WHERE personID=?",
        [name, uid, email, isAdmin, id],
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    fail(/duplicate/i.test(message) ? "That NetID is already in use." : `Database error: ${message}`);
  }

  done(action === "add" ? `User '${name}' added.` : `User '${name}' updated.`);
}

export async function removePerson(formData: FormData): Promise<void> {
  try {
    await requireAdminAction();
  } catch {
    fail("Admin access required.");
  }
  const id = Number(formData.get("person_id"));
  if (!id) fail("Invalid user ID.");
  await execute("DELETE FROM tblPeople WHERE personID = ?", [id]);
  done("User removed.");
}

// ---------------------------------------------------------------------------
// Bill type management
// ---------------------------------------------------------------------------

export async function saveBillType(formData: FormData): Promise<void> {
  try {
    await requireAdminAction();
  } catch {
    fail("Admin access required.");
  }

  const action = String(formData.get("billtype_action") ?? "add");
  const name = String(formData.get("billtype_name") ?? "").trim();
  const emoji = String(formData.get("billtype_emoji") ?? "").trim();
  const feeStr = String(formData.get("billtype_fee") ?? "0");
  const fee = Number(feeStr);

  if (!name || !emoji) fail("Name and emoji are required.");
  if (!Number.isFinite(fee) || fee < 0) fail("Processing fee must be zero or a positive number.");

  try {
    if (action === "add") {
      await execute(
        "INSERT INTO tblBillTypes (typeName, typeEmoji, processingFee) VALUES (?, ?, ?)",
        [name, emoji, fee],
      );
    } else {
      const id = Number(formData.get("billtype_id"));
      if (!id) fail("Invalid bill type ID.");
      await execute(
        "UPDATE tblBillTypes SET typeName=?, typeEmoji=?, processingFee=? WHERE typeID=?",
        [name, emoji, fee, id],
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    fail(
      /duplicate/i.test(message)
        ? "A bill type with that name already exists."
        : `Database error: ${message}`,
    );
  }

  done(action === "add" ? `Bill type '${name}' added.` : `Bill type '${name}' updated.`);
}

export async function removeBillType(formData: FormData): Promise<void> {
  try {
    await requireAdminAction();
  } catch {
    fail("Admin access required.");
  }
  const id = Number(formData.get("billtype_id"));
  if (!id) fail("Invalid bill type ID.");

  const nameRows = await query<RowDataPacket>(
    "SELECT typeName FROM tblBillTypes WHERE typeID = ?",
    [id],
  );
  const name = nameRows[0]?.typeName;
  if (!name) fail("Bill type not found.");

  const countRows = await query<RowDataPacket>(
    "SELECT COUNT(*) AS n FROM tblUtilities WHERE fldItem = ?",
    [name],
  );
  if (Number(countRows[0].n) > 0) {
    fail(`Cannot remove '${name}' — there are existing bills of this type.`);
  }

  await execute("DELETE FROM tblBillTypes WHERE typeID = ?", [id]);
  done(`Bill type '${name}' removed.`);
}

// ---------------------------------------------------------------------------
// Rent configuration
// ---------------------------------------------------------------------------

export async function saveRent(formData: FormData): Promise<void> {
  try {
    await requireAdminAction();
  } catch {
    fail("Admin access required.");
  }

  const amount = Number(formData.get("rent_amount"));
  const start = String(formData.get("rent_start") ?? "");
  const end = String(formData.get("rent_end") ?? "");

  if (!Number.isFinite(amount) || amount <= 0) fail("Rent amount must be a positive number.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    fail("Valid start and end dates are required.");
  }
  if (end <= start) fail("End date must be after start date.");

  const existing = await query<RowDataPacket>("SELECT id FROM tblRentConfig LIMIT 1");
  if (existing.length > 0) {
    await execute(
      "UPDATE tblRentConfig SET rentAmount = ?, startDate = ?, endDate = ? WHERE id = ?",
      [amount, start, end, existing[0].id],
    );
  } else {
    await execute(
      "INSERT INTO tblRentConfig (rentAmount, startDate, endDate) VALUES (?, ?, ?)",
      [amount, start, end],
    );
  }

  done("Rent configuration updated.");
}
