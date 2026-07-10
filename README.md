# 77 N Union Utilities

A web dashboard for splitting and tracking shared utility bills (Gas, Electric, Internet) among apartment roommates at UVM. Full Next.js rewrite (July 2026) of the original PHP site — the PHP source lives in git history at the `php-final` tag.

## Features

- 💡 **Bill dashboard** — all bills with per-person shares, due dates, payment status, and PDF view/download links, with pagination and a personal balance summary
- 🔐 **Passphrase login** — interim single-passphrase gate while the site is being stood up off UVM hosting (the original UVM CAS implementation lives in git history); access and admin rights controlled per-person in the database
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
npm run dev                  # local dev server
npm run build                # production build + typecheck
npm run send-reminders       # run the reminder cron script once
```

For local development set `APP_LOCAL_DEV_USER` to a login uid to bypass the login gate. Uploaded bill PDFs live in Vercel Blob and are served through an auth-gated route.

## Deployment

Deployed on Vercel at [utilities.aaronperkel.com](https://utilities.aaronperkel.com), backed by TiDB Cloud Serverless (database) and Vercel Blob (bill PDFs). The PHP predecessor on UVM silk is retired.
