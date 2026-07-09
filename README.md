# 77 N Union Utilities

A web dashboard for splitting and tracking shared utility bills (Gas, Electric, Internet) among apartment roommates at UVM. Live at [utilities.aperkel.w3.uvm.edu](https://utilities.aperkel.w3.uvm.edu) behind UVM CAS authentication.

## Features

- 💡 **Bill dashboard** — all bills with per-person shares, due dates, payment status, and PDF view/download links, with pagination and a personal balance summary
- 🔐 **CAS authentication** — UVM NetID login; access and admin rights controlled per-person in the database
- 🛠 **Admin portal** — add bills (with PDF upload), mark who has paid, manage residents, configurable bill types with processing fees, and rent configuration
- 📧 **Automated reminders** — daily PHP cron sends email reminders 7 days before a bill is due and again at ≤3 days (including overdue), with a batch confirmation email; admins can also send per-bill and custom bulk emails
- 📅 **Calendar feed** — auto-regenerated `cal.ics` with every bill due date plus a monthly rent event; subscribe via `webcal://utilities.aperkel.w3.uvm.edu/cal.ics`
- 📈 **Trends** — monthly Gas/Electric cost charts with year-over-year comparison and CSV export
- 🔌 **JSON API** — `public/api/unpaid.php` exposes unpaid-bill totals (API key + optional HMAC auth)

## Technology Stack

- **PHP 8.2** with **MySQL** (PDO, `webdb.uvm.edu`)
- **Vanilla JS + CSS** (Chart.js via CDN on the trends page)
- **Composer**: `vlucas/phpdotenv`, `phpmailer/phpmailer` (iCloud SMTP)

## Setup

```bash
composer install
cp utilities.env.example ../utilities.env   # then fill in credentials
php -S localhost:8080                       # local dev server
```

Config lives in `../utilities.env` — one directory **above** the webroot, so secrets are never web-served. For local development set `APP_LOCAL_DEV_USER` to a NetID to mock CAS; the database is remote, so UVM network access (or VPN) is required.

## Deployment

Deployed by copying this tree to the UVM `silk` server (`~/utilities.aperkel.w3.uvm.edu-root/`) — there is no build step. The reminder cron runs daily:

```
0 10 * * * /opt/mise/installs/php/8.2/bin/php /users/a/p/aperkel/utilities.aperkel.w3.uvm.edu-root/scripts/send_reminders.php >> /users/a/p/aperkel/cron.log 2>&1
```

See `schema.sql` for the database schema.
