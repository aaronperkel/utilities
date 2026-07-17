-- db/schema.sql
-- Current schema for the utilities dashboard (TiDB Cloud Serverless, MySQL dialect).
-- The legacy UVM webdb schema (tblPeople/tblUtilities/...) is preserved at
-- `git show php-final:schema.sql` and was migrated by scripts/migrate-to-tidb.ts.
--
-- No FOREIGN KEY constraints: they are still experimental on TiDB, so
-- referential integrity is handled in app code (see removePerson /
-- removeBillType in app/portal/actions.ts).

CREATE TABLE people (
    id       INT UNSIGNED  NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name     VARCHAR(100)  NOT NULL UNIQUE,
    email    VARCHAR(254)  NOT NULL UNIQUE, -- also the login identity (one-time codes are emailed here)
    is_admin TINYINT(1)    NOT NULL DEFAULT 0
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE bill_types (
    id             INT UNSIGNED  NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name           VARCHAR(50)   NOT NULL UNIQUE, -- 'Gas', 'Electric', 'Internet', ...
    emoji          VARCHAR(16)   NOT NULL,
    processing_fee DECIMAL(10,2) NOT NULL DEFAULT 0
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE bills (
    id              INT UNSIGNED  NOT NULL AUTO_INCREMENT PRIMARY KEY,
    type_id         INT UNSIGNED  NOT NULL,              -- references bill_types.id
    bill_date       DATE          NOT NULL,              -- statement date
    due_date        DATE          NOT NULL,
    total           DECIMAL(10,2) NOT NULL,              -- amount + processing fee
    per_person_cost DECIMAL(10,2) NOT NULL,              -- equal split of total
    status          ENUM('unpaid','paid') NOT NULL DEFAULT 'unpaid',
    pdf_path        VARCHAR(255)  DEFAULT NULL,          -- '{year}/{type}/{file}.pdf' under BILLS_DIR
    KEY idx_bills_type (type_id),
    KEY idx_bills_bill_date (bill_date),
    KEY idx_bills_due_date (due_date),
    KEY idx_bills_status (status)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A row here means the person still owes their share of the bill.
-- Rows are deleted as people pay; when none remain the bill flips to 'paid'
-- (see updateOwes in app/portal/actions.ts).
CREATE TABLE bill_debts (
    bill_id   INT UNSIGNED NOT NULL,
    person_id INT UNSIGNED NOT NULL,
    PRIMARY KEY (bill_id, person_id),
    KEY idx_bill_debts_person (person_id)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One-time email login codes (lib/login-codes.ts). Codes are 6 digits,
-- hashed at rest, valid 10 minutes, dead after 5 wrong guesses. Rows are
-- deleted on successful login; long-expired rows are swept opportunistically.
CREATE TABLE login_codes (
    id         INT UNSIGNED     NOT NULL AUTO_INCREMENT PRIMARY KEY,
    person_id  INT UNSIGNED     NOT NULL,           -- references people.id
    code_hash  CHAR(64)         NOT NULL,           -- sha256 hex of the code
    attempts   TINYINT UNSIGNED NOT NULL DEFAULT 0, -- wrong guesses so far
    created_at DATETIME         NOT NULL,           -- UTC; rate-limit window
    expires_at DATETIME         NOT NULL,           -- UTC
    KEY idx_login_codes_person (person_id)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Debounced "thanks for your payment" receipts (lib/thanks.ts). Checking a
-- person off a bill (updateOwes) queues a row; unchecking before it sends
-- cancels it. Once a person's newest row is THANKS_DELAY_MINUTES old, their
-- whole queue is flushed as a single email — so a misclick can be undone and
-- paying several bills at once yields one message. Flushed by the hourly
-- cron endpoint and opportunistically after portal payment edits.
CREATE TABLE payment_thanks (
    bill_id   INT UNSIGNED NOT NULL,
    person_id INT UNSIGNED NOT NULL,
    queued_at DATETIME     NOT NULL, -- UTC; re-checking restarts the debounce timer
    PRIMARY KEY (bill_id, person_id),
    KEY idx_payment_thanks_person (person_id)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Single-row config (the app reads the newest row) for the calendar feed.
CREATE TABLE rent_config (
    id           INT UNSIGNED  NOT NULL AUTO_INCREMENT PRIMARY KEY,
    monthly_rent DECIMAL(10,2) NOT NULL DEFAULT 0,
    lease_start  DATE          NOT NULL,
    lease_end    DATE          NOT NULL
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Single-row reminder schedule (the app reads the newest row), edited in
-- portal → Household → Reminders and consumed by app/api/cron/reminders,
-- which an hourly GitHub Actions cron pings with CRON_SECRET.
CREATE TABLE reminder_config (
    id                   INT UNSIGNED     NOT NULL AUTO_INCREMENT PRIMARY KEY,
    enabled              TINYINT(1)       NOT NULL DEFAULT 1,
    send_hour            TINYINT UNSIGNED NOT NULL DEFAULT 9,  -- 0-23, America/New_York
    first_reminder_days  TINYINT UNSIGNED NOT NULL DEFAULT 7,  -- heads-up at exactly N days out
    urgent_reminder_days TINYINT UNSIGNED NOT NULL DEFAULT 3,  -- urgent at <= N days, incl. overdue
    last_run_at          DATETIME NULL,   -- UTC; last authorized cron check-in
    last_send_date       DATE     NULL,   -- NY date the batch last executed (once-per-day guard)
    last_sent_at         DATETIME NULL,   -- UTC; last time reminder emails actually went out
    last_sent_count      INT UNSIGNED NOT NULL DEFAULT 0
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
