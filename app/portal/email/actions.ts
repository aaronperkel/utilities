"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getEmailMap, requireAdminAction } from "@/lib/auth";
import { customEmailHtml, emailIdentity } from "@/lib/emails";
import { sendSmtpMail } from "@/lib/mail";

export interface CustomEmailState {
  errors: string[];
  subject?: string;
  body?: string;
}

export async function sendCustomEmail(
  _prev: CustomEmailState,
  formData: FormData,
): Promise<CustomEmailState> {
  try {
    await requireAdminAction();
  } catch {
    return { errors: ["Admin access required."] };
  }

  const subject = String(formData.get("subject") ?? "").trim();
  const bodyRaw = String(formData.get("body") ?? "").trim();

  const errors: string[] = [];
  if (!subject) errors.push("Subject cannot be empty.");
  if (!bodyRaw) errors.push("Message body cannot be empty.");
  if (errors.length > 0) return { errors, subject, body: bodyRaw };

  const id = emailIdentity();
  const html = customEmailHtml(bodyRaw, id);
  const emailMap = await getEmailMap();

  if (Object.keys(emailMap).length === 0) {
    return { errors: ["No recipients configured. Email not sent."], subject, body: bodyRaw };
  }

  const sentTo: string[] = [];
  const failedTo: string[] = [];
  for (const [name, to] of Object.entries(emailMap)) {
    if (!to) continue;
    if (await sendSmtpMail(to, subject, html)) {
      sentTo.push(`${name} &lt;${to}&gt;`);
    } else {
      failedTo.push(name);
    }
  }

  if (sentTo.length === 0) {
    return {
      errors: [
        "No emails were sent — every SMTP attempt failed. Check EMAIL_PASS / SMTP_USER in the server env (Vercel logs have the exact error).",
      ],
      subject,
      body: bodyRaw,
    };
  }

  const confirmTo = process.env.APP_CONFIRMATION_EMAIL_TO;
  if (confirmTo) {
    const sentList = sentTo.length === 0 ? "None (or all failed, check logs)" : sentTo.join(", ");
    const confirmBody =
      `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;color:#111827;">` +
      `<h3 style="margin:0 0 8px 0;">Admin Confirmation: Custom Email Sent</h3>` +
      `<p style="margin:6px 0 10px 0;color:#374151;"><b>Subject:</b> ${subject}</p>` +
      `<p style="margin:6px 0 10px 0;color:#374151;"><b>Sent to:</b> ${sentList}</p>` +
      `<hr style="border:none;border-top:1px solid #eef2ff;margin:12px 0;">` +
      `<h4 style="margin:0 0 8px 0;">Message Preview</h4>${html}</div>`;
    await sendSmtpMail(confirmTo, "Admin Confirmation: Custom Email Sent", confirmBody);
  }

  revalidatePath("/portal/email");
  const flash =
    failedTo.length === 0
      ? "Email sent to all residents."
      : `Email sent to ${sentTo.length} resident${sentTo.length === 1 ? "" : "s"} — FAILED for: ${failedTo.join(", ")}.`;
  redirect(`/portal/email?ok=${encodeURIComponent(flash)}`);
}
