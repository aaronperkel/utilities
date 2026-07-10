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
    uid      VARCHAR(64)   NOT NULL UNIQUE, -- login uid (historically the UVM NetID)
    email    VARCHAR(254)  NOT NULL,
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

-- Single-row config (the app reads the newest row) for the calendar feed.
CREATE TABLE rent_config (
    id           INT UNSIGNED  NOT NULL AUTO_INCREMENT PRIMARY KEY,
    monthly_rent DECIMAL(10,2) NOT NULL DEFAULT 0,
    lease_start  DATE          NOT NULL,
    lease_end    DATE          NOT NULL
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
