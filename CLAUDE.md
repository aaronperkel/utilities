# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Next.js 15 (App Router) + TypeScript + Tailwind v4 dashboard for managing shared utility bills (Gas, Electric, Internet) among apartment residents at 77 N Union #3 (UVM). Tracks bills, splits costs per person, monitors payments, and sends email reminders. This is a full rewrite (July 2026) of the PHP site, whose source is preserved in git history at the `php-final` tag (`git show php-final:portal.php`, etc.). When behavior is ambiguous, that PHP source is the ground truth for intent.

## Commands

```bash
npm run dev              # dev server (needs UVM network/VPN for the DB)
npm run build            # production build + typecheck — the main verification gate
npm run start            # serve the production build
npm run send-reminders   # cron reminder script (tsx scripts/send-reminders.ts)
```

There is no test suite; `npm run build` (which typechecks) plus hitting routes against the live DB is the verification path.

## Configuration

Env lives in `.env.local` (see `.env.example` for all keys). Notable beyond the obvious DB/SMTP ones: `SESSION_SECRET` (jose cookie signing), `SITE_PASSPHRASE`/`SITE_OWNER_UID` (login gate; login always fails while `SITE_PASSPHRASE` is unset), `APP_LOCAL_DEV_USER` (set to a uid to bypass login entirely — middleware short-circuits when it is set), `BILLS_DIR` (PDF storage, defaults to `./bill-pdfs`), `API_KEY`/`HMAC_KEY` (the public unpaid API returns 500 until `API_KEY` is set).

The MySQL DB (`webdb.uvm.edu`) is shared with the still-deployed PHP site and only reachable from the UVM network.

## Architecture

### Auth flow

Interim passphrase gate (UVM CAS was removed when the site moved to Vercel — no UVM-network dependencies; the CAS implementation is in git history if ever needed): `middleware.ts` requires a valid session cookie for everything except `/login`, `/cal.ics`, `/api/unpaid`, `/no-access`, and static assets, and redirects to `/login`. The login form (`app/login/`) checks the passphrase against `SITE_PASSPHRASE` (timing-safe) and sets a 30-day jose-signed cookie whose uid is `SITE_OWNER_UID` (default `aperkel`). Middleware only checks cookie validity; **page-level authorization** is `requireUser()` / `requireAdmin()` (`lib/auth.ts`), which check the uid against `tblPeople.uid` / `is_admin` and redirect to `/no-access`. Server actions use `requireAdminAction()` (throws instead of redirecting). The root layout's `getCurrentPerson()` returns null without a DB round-trip when logged out, so `/login` renders even if the DB is unreachable.

### Database

Five tables via `mysql2` (`lib/db.ts`, pool with `dateStrings` + `decimalNumbers` so DATEs are `YYYY-MM-DD` strings and DECIMALs are numbers):

- `tblPeople` (`personID`, `personName`, `uid` = NetID, `email`, `is_admin`)
- `tblUtilities` (`pmkBillID`, `fldDate`, `fldItem`, `fldTotal`, `fldCost` = per-person share, `fldDue`, `fldStatus`, `fldView` = PDF path)
- `tblBillOwes` — junction: who still owes; **rows are deleted as people pay**
- `tblBillTypes` (`typeName`, `typeEmoji`, `processingFee`) — drives the add-bill dropdown, emoji display, and fee math
- `tblRentConfig` — single-row rent amount + lease range for the calendar feed

`fldStatus` (`Paid`/`Unpaid`) is the bill's global status; a bill flips to `Paid` only when nobody is left in `tblBillOwes` (see `updateOwes` in `app/portal/actions.ts`, transactional). Bill math: `total = amount + processingFee`, `cost = round(total / peopleCount, 2)`.

The legacy `schema.sql` (`git show php-final:schema.sql`) is stale — missing `tblBillTypes` and the `uid`/`email`/`is_admin` columns.

### Bill PDFs

Stored under `BILLS_DIR` (`bill-pdfs/{year}/{type}/{name}.pdf`, gitignored, outside `public/`), served auth-gated by `app/files/[...path]/route.ts`. **Legacy quirk:** `fldView` values keep the old `public/2026/Gas/x.pdf` format (the shared DB still serves the PHP site); `billFileHref()` strips the `public/` prefix to build `/files/...` URLs, and new uploads write `fldView` in the same legacy format.

### Key surfaces

- `app/page.tsx` — dashboard: personal balance, bills grouped by year, per-user paid/unpaid badges
- `app/portal/` — admin portal; all mutations are server actions in `actions.ts` (add bill with PDF upload + notification emails, auto-saving payment checkboxes, people/bill-types/rent CRUD, per-bill reminders). Flash messages travel as `/portal?ok=`/`?err=` query params
- `app/trends/` — Chart.js line chart (last 12 months + last-year overlay), insight cards, CSV at `/trends/csv`
- `app/email/` — admin bulk email; `app/previews/` — renders the real template functions from `lib/emails.ts` with sample data
- `app/cal.ics/route.ts` — public iCal feed generated on demand (the PHP site wrote a static file after every change; here it can never go stale)
- `app/api/unpaid/route.ts` — public JSON API, `X-Api-Key` + optional HMAC (`METHOD\nPATH\nTS\nBODY` signature, 300s skew window)
- `scripts/send-reminders.ts` — cron: reminds at exactly 7 days before due and again at ≤3 days (including overdue), then emails a batch confirmation to `APP_CONFIRMATION_EMAIL_TO`

### Email

`lib/mail.ts` (nodemailer, iCloud SMTP/STARTTLS, auth user = from address) + `lib/emails.ts` (HTML templates ported verbatim from PHP — keep the inline-style format; email clients need it).

### Styling

Tailwind v4 (CSS-first config in `app/globals.css`): dark navy theme (`--color-page #0f1724`, `--color-panel #0b1220`, primary blue `#3b82f6`, paid `#48bb78` / unpaid `#f56565`). Shared component classes (`.card`, `.btn*`, `.badge*`, `.due-*`, `.field-*`, `.data-table`) are defined in `@layer components` — note Tailwind v4 cannot `@apply` a custom class from the same layer.

## Deployment

Deployed on Vercel at `utilities.aaronperkel.com` (July 2026), but **not yet functional there**: the MySQL DB is UVM-network-only, so Vercel cannot reach it — every DB-backed page fails until the data moves to an externally reachable host. Local bill-PDF storage (`BILLS_DIR`) also doesn't persist on Vercel's ephemeral filesystem and needs blob storage. The PHP predecessor on UVM silk remains the real production site until both are resolved.
