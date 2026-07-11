import nodemailer from "nodemailer";

let transporter: nodemailer.Transporter | undefined;

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST ?? "smtp.mail.me.com",
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: false,
      requireTLS: true,
      auth: {
        // iCloud SMTP logs in as the account's primary address even when
        // sending From an alias (e.g. noreply@) — SMTP_USER splits the two.
        user: process.env.SMTP_USER || process.env.APP_EMAIL_FROM_ADDRESS,
        pass: process.env.EMAIL_PASS,
      },
    });
  }
  return transporter;
}

export function fromName(): string {
  return process.env.APP_EMAIL_FROM_NAME ?? "77 N Union Utilities";
}

export function fromAddress(): string {
  return process.env.APP_EMAIL_FROM_ADDRESS ?? "";
}

export async function sendSmtpMail(
  to: string,
  subject: string,
  html: string,
): Promise<boolean> {
  try {
    await getTransporter().sendMail({
      from: { name: fromName(), address: fromAddress() },
      to,
      subject,
      html,
    });
    return true;
  } catch (err) {
    console.error(`sendSmtpMail failed sending to ${to}:`, err);
    return false;
  }
}
