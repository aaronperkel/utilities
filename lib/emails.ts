// HTML email templates ported verbatim from the PHP site.

function esc(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function money(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatLongDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function footer(fromName: string, fromAddress: string): string {
  return (
    `<hr style="border:none;border-top:1px solid #eef2ff;margin:12px 0;">` +
    `<p style="margin:0;color:#6b7280;font-size:13px;">${esc(fromName)} — ` +
    `<a href="mailto:${esc(fromAddress)}">${esc(fromAddress)}</a></p>`
  );
}

export interface EmailIdentity {
  fromName: string;
  fromAddress: string;
  baseUrl: string;
}

export function reminderEmailHtml(
  p: {
    personName: string;
    item: string;
    total: number;
    cost: number;
    dueDate: string; // YYYY-MM-DD
  },
  id: EmailIdentity,
): string {
  const portalUrl = `${id.baseUrl}/`;
  return (
    `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,'Helvetica Neue',Arial;color:#0f1724;">` +
    `<h2 style="margin:0 0 8px 0;font-size:18px;color:#111827;">Reminder: ${esc(p.item)}</h2>` +
    `<p style="margin:0 0 8px 0;color:#374151;font-size:14px;">Hello ${esc(p.personName)},</p>` +
    `<p style="margin:0 0 8px 0;color:#374151;font-size:14px;">` +
    `This is a reminder that your <strong>${esc(p.item)}</strong> bill (total: $${money(p.total)}) is due on ` +
    `<strong>${formatLongDate(p.dueDate)}</strong>. Your share: <strong>$${money(p.cost)}</strong>.</p>` +
    `<p style="margin:0 0 12px 0;">` +
    `<a href="${portalUrl}" style="display:inline-block;padding:8px 12px;background:#3B82F6;color:#fff;border-radius:8px;text-decoration:none;">View details</a></p>` +
    footer(id.fromName, id.fromAddress) +
    `</div>`
  );
}

export function newBillEmailHtml(
  p: {
    personName: string;
    item: string;
    total: number;
    cost: number;
    dueDate: string;
    billViewLink: string;
  },
  id: EmailIdentity,
): string {
  const portalLink = `${id.baseUrl}/`;
  return (
    `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,'Helvetica Neue',Arial; color:#0f1724;">` +
    `<h2 style="margin:0 0 8px 0; font-size:18px; color:#111827;">New Bill: ${esc(p.item)}</h2>` +
    `<p style="margin:0 0 8px 0; color:#374151; font-size:14px;">Hello ${esc(p.personName)},</p>` +
    `<p style="margin:0 0 8px 0; color:#374151; font-size:14px;">A new <strong>${esc(p.item)}</strong> bill has been posted.</p>` +
    `<p style="margin:0 0 8px 0; color:#374151; font-size:14px;"><strong>Total:</strong> $${money(p.total)} &nbsp;|&nbsp; <strong>Your share:</strong> $${money(p.cost)}</p>` +
    `<p style="margin:0 0 12px 0; color:#374151; font-size:14px;"><strong>Due:</strong> ${esc(formatLongDate(p.dueDate))}</p>` +
    `<p style="margin:0 0 12px 0;">` +
    `<a href="${esc(p.billViewLink)}" style="display:inline-block;padding:8px 12px;background:#3B82F6;color:#fff;border-radius:8px;text-decoration:none;margin-right:8px;">View Bill PDF</a> ` +
    `<a href="${esc(portalLink)}" style="display:inline-block;padding:8px 12px;background:#e5e7eb;color:#374151;border-radius:8px;text-decoration:none;">Go to Portal</a></p>` +
    footer(id.fromName, id.fromAddress) +
    `</div>`
  );
}

/** Convert raw custom-email text to the styled HTML body (paragraphs + <br>), plus signature. */
export function customEmailHtml(bodyRaw: string, id: EmailIdentity): string {
  const paras = bodyRaw
    .split(/(?:\r?\n){2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  let html = "";
  for (const p of paras) {
    const withBreaks = esc(p).replace(/\r?\n/g, "<br>\n");
    html += `<p style="margin:0 0 12px 0;color:#374151;font-size:14px;line-height:1.4;">${withBreaks}</p>\n`;
  }
  html += `<hr style="border:none;border-top:1px solid #eef2ff;margin:18px 0;">`;
  html += `<p style="margin:0;color:#6b7280;font-size:13px;">${esc(id.fromName)} — <a href="mailto:${esc(id.fromAddress)}">${esc(id.fromAddress)}</a></p>`;
  return html;
}

export function emailIdentity(): EmailIdentity {
  return {
    fromName: process.env.APP_EMAIL_FROM_NAME ?? "77 N Union Utilities",
    fromAddress: process.env.APP_EMAIL_FROM_ADDRESS ?? "",
    baseUrl: (process.env.APP_BASE_URL ?? "").replace(/\/+$/, ""),
  };
}
