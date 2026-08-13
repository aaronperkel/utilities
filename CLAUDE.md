# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Next.js 15 (App Router) + TypeScript + Tailwind v4 dashboard for managing shared utility bills (Gas, Electric, Internet) among apartment residents at 77 N Union #3 (UVM). Tracks bills, splits costs per person, monitors payments, and sends email reminders. This is a full rewrite (July 2026) of the PHP site, whose source is preserved in git history at the `php-final` tag (`git show php-final:portal.php`, etc.). When behavior is ambiguous, that PHP source is the ground truth for intent.

## Commands

```bash
npm run dev              # dev server
npm run build            # production build + typecheck — the main verification gate
npm run start            # serve the production build
npm run send-reminders   # cron reminder script (tsx scripts/send-reminders.ts)
npm run migrate-to-tidb  # one-time webdb → TiDB data migration (needs UVM VPN + SRC_DB_* env)
npm run migrate-pdfs-to-blob  # one-time local bill-pdfs/ → Vercel Blob upload + DB cross-check
```

There is no test suite; `npm run build` (which typechecks) plus hitting routes against the live DB is the verification path.

## Configuration

Env lives in `.env.local` (see `.env.example` for all keys). Notable beyond the obvious DB/SMTP ones: `SESSION_SECRET` (jose cookie signing), `SITE_PASSPHRASE`/`SITE_OWNER_EMAIL` (fallback passphrase login; that path always fails while `SITE_PASSPHRASE` is unset — the primary email-code login needs only SMTP), `APP_LOCAL_DEV_USER` (set to a `people.email` to bypass login entirely — middleware short-circuits when it is set), `BLOB_READ_WRITE_TOKEN` (Vercel Blob — bill PDFs and apartment documents), `API_KEY`/`HMAC_KEY` (the public unpaid API returns 500 until `API_KEY` is set), `CRON_SECRET` (bearer token for `/api/cron/reminders`; must match the GitHub Actions repo secret of the same name).

The database lives on TiDB Cloud Serverless (MySQL-compatible, TLS on port 4000, reachable from anywhere). The legacy copy on `webdb.uvm.edu` (UVM-network-only, shared with the retired PHP site) is frozen at migration time; `scripts/migrate-to-tidb.ts` did the one-time copy and rename.

## Architecture

### Auth flow

Per-person email-code login (UVM CAS was removed when the site moved to Vercel — no UVM-network dependencies; the CAS implementation is in git history if ever needed): `middleware.ts` requires a valid session cookie for everything except `/login`, `/cal.ics`, `/api/unpaid`, `/no-access`, and static assets, redirects to `/login`, and silently re-issues the 30-day jose-signed cookie once it is a week old (sliding renewal — monthly visitors never re-login). `/login` (`app/login/`) is a two-step form: enter a `people.email` address → a 6-digit one-time code is emailed (`lib/login-codes.ts`: sha256-hashed in the `login_codes` table, 10-minute TTL, 5 wrong guesses kill it, 3 codes per person per window, deleted on success) → correct code sets the session cookie with **that person's email** (email is the sole login identity — UVM NetIDs are retired and `people` has no uid column). The code input uses `autocomplete="one-time-code"` so Apple Mail/Safari autofill the code. A fallback passphrase form (`/login?mode=passphrase`, link hidden when unconfigured) checks `SITE_PASSPHRASE` (timing-safe) and logs in as `SITE_OWNER_EMAIL` (default `me@aaronperkel.com`); that path dies if `SITE_PASSPHRASE` is unset — in practice it is set only on Vercel preview deployments, not prod. Middleware only checks cookie validity; **page-level authorization** is `requireUser()` / `requireAdmin()` (`lib/auth.ts`), which check the session email against `people.email` / `is_admin` and redirect to `/no-access`. Server actions use `requireAdminAction()` (throws instead of redirecting). The root layout's `getCurrentPerson()` returns null without a DB round-trip when logged out, so `/login` renders even if the DB is unreachable.

### Database

Nine tables via `mysql2` (`lib/db.ts`, pool with `dateStrings` + `decimalNumbers` so DATEs are `YYYY-MM-DD` strings and DECIMALs are numbers). Current DDL is checked in at `db/schema.sql`:

- `people` (`id`, `name`, `email` = also the login identity (unique), `is_admin`)
- `bills` (`id`, `type_id` → `bill_types`, `bill_date`, `due_date`, `total`, `per_person_cost`, `status` enum `'unpaid'|'paid'`, `pdf_path`)
- `bill_debts` (`bill_id`, `person_id`) — junction: who still owes; **rows are deleted as people pay**
- `bill_types` (`id`, `name`, `emoji`, `processing_fee`) — drives the add-bill dropdown, emoji display, and fee math
- `login_codes` (`person_id`, `code_hash`, `attempts`, `created_at`, `expires_at`) — live one-time login codes; see Auth flow
- `payment_thanks` (`bill_id`, `person_id`, `queued_at`) — debounced thank-you receipt queue (`lib/thanks.ts`): checking someone off a bill queues a row, unchecking cancels it, and a person's queue is flushed as one email once its newest row is `THANKS_DELAY_MINUTES` (10) old — flushed by the hourly cron tick and via `after()` following portal payment edits
- `rent_config` — single-row rent amount + lease range for the calendar feed
- `reminder_config` — single-row reminder schedule (enabled, ET send hour, heads-up/urgent day offsets) plus cron bookkeeping (`last_run_at`, `last_send_date` once-per-day guard, `last_sent_at`/`last_sent_count`); edited in portal → Household
- `documents` (`title`, `category`, `file_path`, `content_type`, `file_size`, `uploaded_at`, `uploaded_by`) — apartment paperwork shown at `/documents`; `category` is a key from the fixed `DOCUMENT_CATEGORIES` list in `lib/documents.ts` (deliberately *not* a table like `bill_types` — categories carry no math and would only add another CRUD surface), and `uploaded_by` is read via `LEFT JOIN people` so a document outlives the resident who added it

**No FK constraints** (experimental on TiDB): integrity is app-level — `removePerson` deletes the person's `bill_debts` and `payment_thanks` rows, `removeBillType` refuses while bills reference the type. `status` is the bill's global state; a bill flips to `'paid'` only when nobody is left in `bill_debts` (see `updateOwes` in `app/portal/actions.ts`, transactional). Bill math: `total = amount + processing_fee`, `per_person_cost = round(total / peopleCount, 2)`. SQL aliases map snake_case columns to camelCase TS fields (`per_person_cost AS perPersonCost`); bill queries join `bill_types` so each `Bill` carries `typeName`/`typeEmoji`.

The pre-migration schemas are history only: `git show php-final:schema.sql` (stale even for the PHP era) and the legacy `tblPeople`/`tblUtilities`/`tblBillOwes`/`tblBillTypes`/`tblRentConfig` names that `scripts/migrate-to-tidb.ts` maps from.

### Stored files (bill PDFs + documents)

Everything lives in Vercel Blob (`BLOB_READ_WRITE_TOKEN`; dev and prod share the store) with keys equal to the stored path, served auth-gated by `app/files/[...path]/route.ts`, which `head()`s the key and streams the blob so its public-but-unguessable URL never leaks. That route serves **any logged-in person** (not just admins) and is an **extension allowlist** (`SERVABLE_TYPES`: pdf/png/jpg/jpeg/heic/heif → content type, `nosniff`, no SVG) — anything else 404s, which is what keeps it from being a general blob proxy.

Two writers with deliberately different key strategies:

- **Bill PDFs** — `bills.pdf_path` is `{year}/{type}/{name}.pdf`; `billFileHref()` prepends `/files/`. Uploaded through the `addBill` **server action** with `addRandomSuffix: false` + `allowOverwrite: true`, so keys stay deterministic and re-posting a statement replaces it. Capped at 4MB by `experimental.serverActions.bodySizeLimit` in `next.config.ts` — Vercel hard-caps serverless request bodies at 4.5MB, so that is the real ceiling for this path. The local `bill-pdfs/` tree is the pre-Blob copy (gitignored, kept as backup); `scripts/migrate-pdfs-to-blob.ts` did the one-time upload.
- **Documents** — `documents.file_path` always starts with `documents/` (`isDocumentPath()` enforces it on both upload and delete, so neither can reach a bill's key); `documentFileHref()` prepends `/files/`. Uploaded **client-direct** via `@vercel/blob/client` `upload()` against `app/api/documents/upload/route.ts`, which bypasses the 4.5MB body cap entirely (25MB limit, `addRandomSuffix: true` so same-named files coexist). That route is excluded from `middleware.ts` because Blob's upload-completed callback carries no session cookie; it gates on `requireAdminAction()` itself. **`onUploadCompleted` is intentionally a no-op** — it never fires against localhost, so the DB row is inserted by `addDocument()` after `upload()` resolves, which also `head()`s the key to confirm the blob exists. `removeDocument` holds the codebase's only `del()` call.

### Key surfaces

- `app/page.tsx` — dashboard: statement summary strip (balance / next due / bill count), bills grouped by year, per-user paid/unpaid tags
- `app/portal/` — admin portal in three tabs (`PortalTabs`): `/portal` = bills (who-owes strip, add-bill disclosure, payment checkboxes, per-bill reminders), `/portal/household` = residents + bill types + rent, `/portal/email` = bulk email (old `/email` URL 301s there via `next.config.ts`). All mutations are server actions; flash messages travel as `?ok=`/`?err=` query params, and `done()`/`fail()` in `actions.ts` take the destination path so household actions land back on their tab
- `app/documents/` — apartment paperwork (lease, renters insurance, …) grouped by category. **Every resident reads it** (`requireUser()`); the add/edit/remove controls render only behind `person.isAdmin`, so this is the one non-portal surface with admin affordances inline. Nav labels it "Docs" for width
- `app/trends/` — Chart.js line chart (last 12 months + last-year overlay, colors read from the CSS tokens at mount and rebuilt on theme change), insight columns, CSV at `/trends/csv`
- `app/cal.ics/route.ts` — public iCal feed generated on demand (the PHP site wrote a static file after every change; here it can never go stale)
- `app/api/unpaid/route.ts` — public JSON API, `X-Api-Key` + optional HMAC (`METHOD\nPATH\nTS\nBODY` signature, 300s skew window)
- `app/api/cron/reminders/route.ts` — reminder scheduler: a GitHub Actions workflow (`.github/workflows/reminders.yml`) pings it hourly with `Authorization: Bearer CRON_SECRET`; the route reads `reminder_config` and sends on the first tick at or after the configured ET hour (GitHub drops delayed scheduled runs, so ticks are not reliably hourly), at most once per NY calendar day. Core logic is shared with the CLI in `lib/reminders.ts` (heads-up at exactly N days before due, urgent at ≤M days including overdue — defaults 7/3 — then a batch confirmation to `APP_CONFIRMATION_EMAIL_TO`); every authorized tick also flushes the `payment_thanks` receipt queue, independent of the reminder schedule
- `scripts/send-reminders.ts` — manual CLI for the same batch (thin wrapper over `lib/reminders.ts`); running it stamps `last_send_date`, so the cron won't double-send that day

### Email

`lib/mail.ts` (nodemailer, iCloud SMTP/STARTTLS; login is `SMTP_USER` falling back to the from address — iCloud logs in as the primary address even when sending From an alias like noreply@; Reply-To is the human `contactAddress()`) + `lib/emails.ts` (statement-portal-styled templates — shared `emailShell` with mono eyebrows/ruled tables mirroring the site's light tokens; inline styles only, email clients ignore stylesheets; light-theme only on purpose). All seven emails (reminder, new bill, login code, payment thank-you, custom, batch + bulk confirmations) go through these templates. `sendSmtpMail` returns false on failure (logged, not thrown); callers are responsible for surfacing failures.

### Styling

Tailwind v4 (CSS-first config in `app/globals.css`), "statement portal" theme: light and dark follow the system via `prefers-color-scheme` — raw values live as CSS variables on `:root` and are mapped to utilities in `@theme inline` (so `bg-panel` etc. flip automatically; anything hardcoded won't). One accent blue; green/red/amber are reserved for paid/unpaid/due-soon semantics. IBM Plex Mono (next/font, `--font-ledger`) is the signature: applied via `.figure`/`.eyebrow`/table headers to every number, date, and section label. Shared component classes (`.panel`, `.eyebrow`, `.figure`, `.btn*`, `.tag*`, `.due-*`, `.field-*`, `.data-table`, `.tab*`, `.flash*`) live in `@layer components` — note Tailwind v4 cannot `@apply` a custom class from the same layer.

## Deployment

Deployed on Vercel at `utilities.aaronperkel.com` (July 2026). The DB is TiDB Cloud Serverless and PDFs live in Vercel Blob — set the `DB_*` env vars, `BLOB_READ_WRITE_TOKEN` (connecting the Blob store to the project sets the token automatically), and `CRON_SECRET` in the Vercel project. Reminders are scheduled by `.github/workflows/reminders.yml` (hourly GitHub Actions ping of `/api/cron/reminders`; GitHub Actions was chosen over Vercel Cron because Hobby-plan crons are limited to once daily, which would defeat the portal-configurable send hour). The PHP predecessor on UVM silk is retired; its webdb data is frozen as of the TiDB migration.
