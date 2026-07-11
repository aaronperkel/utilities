// HTML email templates in the site's statement-portal design language
// (2026-07 refresh of the verbatim PHP port). Everything is inline-styled
// tables — email clients ignore stylesheets — and light-theme only, since
// dark-mode support across clients is unreliable. Colors mirror the light
// tokens in app/globals.css.

const PAGE = "#f4f5f6";
const PANEL = "#ffffff";
const INK = "#1b2530";
const INK_MUTED = "#5b6875";
const LINE = "#dfe2e6"; // --line flattened onto white
const LINE_SOFT = "#eef0f2"; // --line-soft flattened onto white
const ACCENT = "#1d5fd6";
const UNPAID = "#c03538";

const SANS =
  "system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";
const MONO =
  "ui-monospace,'SF Mono',SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace";

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

export interface EmailIdentity {
  fromName: string;
  fromAddress: string;
  baseUrl: string;
  contactAddress: string; // human-reachable address for footers/Reply-To
}

/** Where replies and "contact" links should go (the From may be a noreply@). */
export function contactAddress(): string {
  return process.env.APP_EMAIL_CONTACT_ADDRESS ?? "me@aaronperkel.com";
}

export function emailIdentity(): EmailIdentity {
  return {
    fromName: process.env.APP_EMAIL_FROM_NAME ?? "77 N Union Utilities",
    fromAddress: process.env.APP_EMAIL_FROM_ADDRESS ?? "",
    baseUrl: (process.env.APP_BASE_URL ?? "").replace(/\/+$/, ""),
    contactAddress: contactAddress(),
  };
}

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

/** Mono uppercase section label — the email cousin of the site's .eyebrow. */
function eyebrow(text: string, color = INK_MUTED): string {
  return (
    `<div style="font-family:${MONO};font-size:11px;font-weight:600;letter-spacing:0.14em;` +
    `text-transform:uppercase;color:${color};margin:0 0 10px;">${esc(text)}</div>`
  );
}

function heading(text: string): string {
  return (
    `<h1 style="margin:0 0 14px;font-family:${SANS};font-size:19px;font-weight:700;` +
    `letter-spacing:-0.01em;color:${INK};">${esc(text)}</h1>`
  );
}

function paragraph(html: string): string {
  return (
    `<p style="margin:0 0 14px;font-family:${SANS};font-size:14px;line-height:1.55;` +
    `color:${INK};">${html}</p>`
  );
}

interface StatementRow {
  label: string;
  value: string; // pre-escaped by callers when needed
  strong?: boolean;
  color?: string;
}

/** Ruled label/value table — the email cousin of the site's .data-table. */
function statementTable(rows: StatementRow[]): string {
  const trs = rows
    .map((r, i) => {
      const border = i === 0 ? "" : `border-top:1px solid ${LINE_SOFT};`;
      const weight = r.strong ? 600 : 400;
      const size = r.strong ? "15px" : "13px";
      const color = r.color ?? INK;
      return (
        `<tr>` +
        `<td style="${border}padding:9px 2px;font-family:${MONO};font-size:11px;` +
        `letter-spacing:0.12em;text-transform:uppercase;color:${INK_MUTED};">${esc(r.label)}</td>` +
        `<td align="right" style="${border}padding:9px 2px;font-family:${MONO};` +
        `font-size:${size};font-weight:${weight};color:${color};">${r.value}</td>` +
        `</tr>`
      );
    })
    .join("");
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" ` +
    `style="margin:4px 0 18px;border-top:1px solid ${LINE};border-bottom:1px solid ${LINE};">` +
    `${trs}</table>`
  );
}

function button(href: string, label: string, variant: "primary" | "subtle" = "primary"): string {
  const styles =
    variant === "primary"
      ? `background:${ACCENT};color:#ffffff;border:1px solid ${ACCENT};`
      : `background:${PANEL};color:${INK};border:1px solid ${LINE};`;
  return (
    `<a href="${esc(href)}" style="display:inline-block;padding:9px 16px;margin:0 8px 8px 0;` +
    `${styles}border-radius:7px;font-family:${SANS};font-size:13px;font-weight:600;` +
    `text-decoration:none;">${esc(label)}</a>`
  );
}

/**
 * Statement-card wrapper: page-colored backdrop, eyebrow masthead, white
 * panel, and the shared footer (contact address, not the noreply From).
 */
function emailShell(bodyHtml: string, id: EmailIdentity, preheader?: string): string {
  const hidden = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${esc(preheader)}</div>`
    : "";
  return (
    `<div style="margin:0;padding:28px 16px;background:${PAGE};">` +
    hidden +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;">` +
    `<tr><td style="padding:0 6px 10px;font-family:${MONO};font-size:11px;font-weight:600;` +
    `letter-spacing:0.14em;text-transform:uppercase;color:${INK_MUTED};">` +
    `Perk Utilities&nbsp;&middot;&nbsp;77 N Union #3</td></tr>` +
    `<tr><td style="background:${PANEL};border:1px solid ${LINE};border-radius:10px;` +
    `padding:26px 28px;">${bodyHtml}</td></tr>` +
    `<tr><td style="padding:14px 6px 0;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>` +
    `<td style="font-family:${MONO};font-size:11px;letter-spacing:0.1em;` +
    `text-transform:uppercase;color:${INK_MUTED};">Perk Utilities&nbsp;&middot;&nbsp;Est. 2024</td>` +
    `<td align="right" style="font-family:${SANS};font-size:12px;">` +
    `<a href="mailto:${esc(id.contactAddress)}" style="color:${ACCENT};text-decoration:none;">` +
    `${esc(id.contactAddress)}</a></td>` +
    `</tr></table></td></tr>` +
    `</table></td></tr></table></div>`
  );
}

function paragraphsFromRaw(bodyRaw: string): string {
  return bodyRaw
    .split(/(?:\r?\n){2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => paragraph(esc(p).replace(/\r?\n/g, "<br>\n")))
    .join("\n");
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export function reminderEmailHtml(
  p: {
    personName: string;
    item: string;
    total: number;
    cost: number;
    dueDate: string; // YYYY-MM-DD
    urgent?: boolean;
  },
  id: EmailIdentity,
): string {
  const due = formatLongDate(p.dueDate);
  const body =
    eyebrow(p.urgent ? "Urgent — due soon" : "Payment reminder", p.urgent ? UNPAID : INK_MUTED) +
    heading(`${p.item} bill due ${due}`) +
    paragraph(
      `Hello ${esc(p.personName)}, this is a reminder that your share of the ` +
        `<strong>${esc(p.item)}</strong> bill is coming due.`,
    ) +
    statementTable([
      { label: "Bill", value: esc(p.item) },
      { label: "Statement total", value: `$${money(p.total)}` },
      { label: "Your share", value: `$${money(p.cost)}`, strong: true },
      { label: "Due", value: esc(due), color: p.urgent ? UNPAID : INK },
    ]) +
    button(`${id.baseUrl}/`, "View statement");
  return emailShell(body, id, `${p.item} — your share $${money(p.cost)}, due ${due}.`);
}

/** One-time login code (app/login). The code leads the subject so it shows
 *  in notification previews and Apple Mail's code autofill. */
export function loginCodeEmailHtml(
  p: { personName: string; code: string },
  id: EmailIdentity,
): string {
  const body =
    eyebrow("Sign-in code") +
    heading("Your one-time login code") +
    paragraph(
      `Hello ${esc(p.personName)}, enter this code on the login page to sign in. ` +
        `It expires in 10 minutes.`,
    ) +
    `<div style="margin:4px 0 18px;padding:18px 2px;border-top:1px solid ${LINE};` +
    `border-bottom:1px solid ${LINE};text-align:center;font-family:${MONO};` +
    `font-size:30px;font-weight:600;letter-spacing:0.35em;text-indent:0.35em;` +
    `color:${INK};">${esc(p.code)}</div>` +
    paragraph(
      `<span style="color:${INK_MUTED};font-size:13px;">Didn't try to sign in? ` +
        `You can safely ignore this email.</span>`,
    );
  return emailShell(body, id, `${p.code} is your login code.`);
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
  const due = formatLongDate(p.dueDate);
  const body =
    eyebrow("New bill posted") +
    heading(`${p.item} — ${due}`) +
    paragraph(
      `Hello ${esc(p.personName)}, a new <strong>${esc(p.item)}</strong> bill was just added ` +
        `to the statement.`,
    ) +
    statementTable([
      { label: "Bill", value: esc(p.item) },
      { label: "Statement total", value: `$${money(p.total)}` },
      { label: "Your share", value: `$${money(p.cost)}`, strong: true },
      { label: "Due", value: esc(due) },
    ]) +
    button(p.billViewLink, "View bill PDF") +
    button(`${id.baseUrl}/`, "Open portal", "subtle");
  return emailShell(body, id, `${p.item} — your share $${money(p.cost)}, due ${due}.`);
}

/** Freeform admin note (portal → Email tab), wrapped in the statement shell. */
export function customEmailHtml(bodyRaw: string, id: EmailIdentity): string {
  const body = eyebrow("A note from the household admin") + paragraphsFromRaw(bodyRaw);
  return emailShell(body, id);
}

/** Cron batch summary sent to APP_CONFIRMATION_EMAIL_TO. */
export function batchConfirmationEmailHtml(
  sent: { person: string; email: string; item: string }[],
  id: EmailIdentity,
): string {
  const rows = sent
    .map(
      (r, i) =>
        `<tr>` +
        `<td style="${i === 0 ? "" : `border-top:1px solid ${LINE_SOFT};`}padding:8px 2px;` +
        `font-family:${SANS};font-size:13px;color:${INK};">${esc(r.person)}</td>` +
        `<td style="${i === 0 ? "" : `border-top:1px solid ${LINE_SOFT};`}padding:8px 2px;` +
        `font-family:${SANS};font-size:13px;color:${INK_MUTED};">${esc(r.email)}</td>` +
        `<td align="right" style="${i === 0 ? "" : `border-top:1px solid ${LINE_SOFT};`}` +
        `padding:8px 2px;font-family:${MONO};font-size:13px;color:${INK};">${esc(r.item)}</td>` +
        `</tr>`,
    )
    .join("");
  const body =
    eyebrow("Reminder batch") +
    heading(`${sent.length} reminder${sent.length === 1 ? "" : "s"} sent`) +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" ` +
    `style="margin:4px 0 6px;border-top:1px solid ${LINE};border-bottom:1px solid ${LINE};">` +
    `${rows}</table>`;
  return emailShell(body, id, `Reminder batch: ${sent.length} sent.`);
}

/** Bulk-email receipt sent to APP_CONFIRMATION_EMAIL_TO. */
export function adminConfirmationEmailHtml(
  p: { subject: string; sentSummary: string; bodyRaw: string },
  id: EmailIdentity,
): string {
  const body =
    eyebrow("Bulk email receipt") +
    heading("Sent to the household") +
    statementTable([
      { label: "Subject", value: esc(p.subject) },
      { label: "Delivered", value: esc(p.sentSummary) },
    ]) +
    eyebrow("Message preview") +
    paragraphsFromRaw(p.bodyRaw);
  return emailShell(body, id, `Bulk email sent: ${p.subject}`);
}
