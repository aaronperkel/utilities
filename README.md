# 77 N Union Utilities

A web dashboard for splitting and tracking shared utility bills (Gas, Electric, Internet) among apartment roommates at UVM. Full Next.js rewrite (July 2026) of the original PHP site — the PHP source lives in git history at the `php-final` tag.

## Features

- 💡 **Bill dashboard** — all bills with per-person shares, due dates, payment status, and PDF view/download links, with pagination and a personal balance summary
- 🔐 **CAS authentication** — UVM NetID login (implemented natively, no CAS library); access and admin rights controlled per-person in the database
- 🛠 **Admin portal** — add bills (with PDF upload + notification emails), auto-saving payment checkboxes, manage residents, configurable bill types with processing fees, and rent configuration
- 📧 **Automated reminders** — cron script emails reminders 7 days before a bill is due and again at ≤3 days (including overdue), with a batch confirmation email; admins can also send per-bill and custom bulk emails
- 📅 **Calendar feed** — `/cal.ics` generated on demand with every bill due date plus a monthly rent event
- 📈 **Trends** — monthly Gas/Electric cost charts (Chart.js) with year-over-year comparison, insight cards, and CSV export
- 🔌 **JSON API** — `/api/unpaid` exposes unpaid-bill totals (API key + optional HMAC auth)

## Technology Stack

- **Next.js 15** (App Router) + **TypeScript** + **Tailwind v4**
- **MySQL** via `mysql2` (`webdb.uvm.edu` — UVM network only)
- **nodemailer** (iCloud SMTP) for email, **jose** for signed session cookies

## Setup

```bash
npm install
cp .env.example .env.local   # then fill in credentials
npm run dev                  # local dev server (UVM network/VPN required for the DB)
npm run build                # production build + typecheck
npm run send-reminders       # run the reminder cron script once
```

For local development set `APP_LOCAL_DEV_USER` to a NetID to bypass CAS. Uploaded bill PDFs are stored outside the repo under `BILLS_DIR` (default `./bill-pdfs`) and served through an auth-gated route.

## Deployment

Not yet deployed — the PHP predecessor at [utilities.aperkel.w3.uvm.edu](https://utilities.aperkel.w3.uvm.edu) remains the live production site. UVM's silk shared hosting can't run a Node server, and the database is only reachable from the UVM network, so the hosting target is still being decided.
