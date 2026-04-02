<?php
require_once dirname(__DIR__) . '/includes/top.php';
?>
<main>
    <h1>Database Schema and SQL Information</h1>

    <p>This page documents the SQL schema for the Utilities Manager application,
        including table creation statements, example data inserts, migration information,
        and useful query examples for the normalized database structure.</p>

    <h2>Table Creation Statements (Normalized Schema)</h2>

    <section>
        <h3><code>tblPeople</code></h3>
        <p>Stores information about individuals involved in bill sharing.</p>
        <pre>
CREATE TABLE tblPeople (
    personID INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    personName VARCHAR(100) NOT NULL UNIQUE
    -- Note: Consider adding personEmail VARCHAR(255) NULL UNIQUE if emails are to be stored directly with people.
    -- Currently, emails are mapped via APP_USER_EMAILS in .env based on personName.
);
        </pre>
    </section>

    <section>
        <h3><code>tblUtilities</code></h3>
        <p>Stores details for each utility bill. The <code>fldOwe</code> column has been removed in favor of
            <code>tblBillOwes</code>.</p>
        <pre>
CREATE TABLE tblUtilities (
    pmkBillID INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    fldDate DATE DEFAULT NULL,
    fldItem VARCHAR(50) DEFAULT NULL,
    fldTotal DECIMAL(10, 2) DEFAULT NULL,
    fldCost DECIMAL(10, 2) DEFAULT NULL, -- Cost per person, assuming equal split.
    fldDue DATE DEFAULT NULL,
    fldStatus VARCHAR(10) DEFAULT NULL, -- e.g., 'Unpaid', 'Paid'
    fldView VARCHAR(255) DEFAULT NULL  -- Path to the bill PDF. Increased length from 150 to 255.
);
        </pre>
        <p><strong>Notes on <code>tblUtilities</code> fields:</strong></p>
        <ul>
            <li><code>fldItem</code>: Could be an <code>ENUM('Gas', 'Electric', 'Internet')</code> if item types are
                strictly limited. For more flexibility, a foreign key to a <code>tblItems</code> table could be used.
            </li>
            <li><code>fldStatus</code>: Could be an <code>ENUM('Unpaid', 'Paid')</code>. `VARCHAR(10)` provides
                flexibility.</li>
        </ul>
    </section>

    <section>
        <h3><code>tblBillOwes</code></h3>
        <p>Linking table to manage which people owe for which bill (many-to-many relationship).</p>
        <pre>
CREATE TABLE tblBillOwes (
    billID INT NOT NULL,
    personID INT NOT NULL,
    PRIMARY KEY (billID, personID),
    FOREIGN KEY (billID) REFERENCES tblUtilities(pmkBillID) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (personID) REFERENCES tblPeople(personID) ON DELETE CASCADE ON UPDATE CASCADE
);
        </pre>
    </section>

    <hr>

    <h2>Example Data Insert Statements</h2>

    <section>
        <h3>Populate <code>tblPeople</code>:</h3>
        <pre>
INSERT INTO tblPeople (personName) VALUES ('Aaron'), ('Owen'), ('Ben');
-- Add other individuals as needed.
        </pre>
    </section>

    <section>
        <h3>Insert a Bill into <code>tblUtilities</code>:</h3>
        <pre>
INSERT INTO tblUtilities (fldDate, fldItem, fldTotal, fldCost, fldDue, fldStatus, fldView)
VALUES ('2024-07-01', 'Gas', '30.00', '10.00', '2024-07-15', 'Unpaid', 'public/2024/Gas/gas_july.pdf');
-- Let's assume this bill gets pmkBillID = 1 after insertion.
        </pre>
    </section>

    <section>
        <h3>Link People to the Bill in <code>tblBillOwes</code>:</h3>
        <p>This indicates who is responsible for paying their share of the bill.</p>
        <pre>
-- Assuming the 'Gas' bill above received pmkBillID = 1 after insertion,
-- and 'Aaron' is personID = 1, 'Owen' is personID = 2, 'Ben' is personID = 3.
INSERT INTO tblBillOwes (billID, personID) VALUES (1, 1); -- Aaron owes for bill 1
INSERT INTO tblBillOwes (billID, personID) VALUES (1, 2); -- Owen owes for bill 1
INSERT INTO tblBillOwes (billID, personID) VALUES (1, 3); -- Ben owes for bill 1
        </pre>
        <p>When a person pays their share, their corresponding row is DELETED from this table.
            If all persons associated with a bill have their entries removed from `tblBillOwes`,
            the `fldStatus` in `tblUtilities` for that bill is updated to 'Paid'.</p>
    </section>

    <hr>

    <h2>Migrating from Denormalized `fldOwe` to Normalized Structure</h2>
    <p>If you have existing data in `tblUtilities` with the old `fldOwe` (comma-separated names) column, here's a
        conceptual migration process:</p>
    <ol>
        <li><strong>Backup your database.</strong></li>
        <li>Create the new `tblPeople` and `tblBillOwes` tables as defined above.</li>
        <li>Populate `tblPeople`:
            <pre>
-- Identify unique names from the old fldOwe column and existing user configurations.
-- This step might require scripting (PHP, Python) to parse all fldOwe strings.
-- Example:
INSERT IGNORE INTO tblPeople (personName) VALUES ('Aaron');
INSERT IGNORE INTO tblPeople (personName) VALUES ('Owen');
INSERT IGNORE INTO tblPeople (personName) VALUES ('Ben');
-- ... and so on for all unique names found.
            </pre>
        </li>
        <li>Populate `tblBillOwes`: This typically requires a script.
            <p>Conceptual PHP/Python logic:</p>
            <pre>
// 1. Fetch all rows from tblUtilities (pmkBillID, fldOwe).
// 2. For each row:
//    a. Get the billID.
//    b. Split the fldOwe string into an array of names.
//    c. For each name:
//        i. Find the corresponding personID from tblPeople (SELECT personID FROM tblPeople WHERE personName = :name).
//       ii. If personID found, INSERT INTO tblBillOwes (billID, personID) VALUES (:billID, :personID).
            </pre>
        </li>
        <li>Verify data integrity in `tblBillOwes` and `tblPeople`.</li>
        <li>Remove `fldOwe` from `tblUtilities`:
            <pre>
ALTER TABLE tblUtilities DROP COLUMN fldOwe;
            </pre>
        </li>
        <li>Update application code to use the new schema (as done in previous subtasks).</li>
    </ol>
    <p><strong>Note on `ALTER TABLE` for existing `tblUtilities` columns (from previous schema update):</strong></p>
    <p>If you haven't already applied the data type changes from the previous schema update (e.g., `VARCHAR` to
        `DATE`/`DECIMAL`), ensure those are done first.
        Example `ALTER` statements (ensure data cleaning is performed before running these):</p>
    <pre>
-- Ensure data in fldDate and fldDue is 'YYYY-MM-DD'.
-- Ensure fldTotal and fldCost contain only numeric strings (remove '$', ',').
ALTER TABLE tblUtilities
    MODIFY COLUMN fldDate DATE DEFAULT NULL,
    MODIFY COLUMN fldTotal DECIMAL(10, 2) DEFAULT NULL,
    MODIFY COLUMN fldCost DECIMAL(10, 2) DEFAULT NULL,
    MODIFY COLUMN fldDue DATE DEFAULT NULL,
    MODIFY COLUMN fldStatus VARCHAR(10) DEFAULT NULL; -- e.g., 'Unpaid', 'Paid'
    </pre>

    <hr>

    <h2>Example Queries for Normalized Schema</h2>

    <section>
        <h3>Who owes for Bill ID 123?</h3>
        <pre>
SELECT p.personName
FROM tblPeople p
JOIN tblBillOwes bo ON p.personID = bo.personID
WHERE bo.billID = 123;
        </pre>
    </section>

    <section>
        <h3>What unpaid bills does 'Ben' have? (Show bill item and cost per person)</h3>
        <pre>
SELECT u.fldItem, u.fldCost, u.fldDue
FROM tblUtilities u
JOIN tblBillOwes bo ON u.pmkBillID = bo.billID
JOIN tblPeople p ON bo.personID = p.personID
WHERE p.personName = 'Ben' AND u.fldStatus <> 'Paid';
        </pre>
    </section>

    <section>
        <h3>List each bill (Item, Due Date, Status) with its debtors (comma-separated names)</h3>
        <pre>
SELECT
    u.fldItem,
    u.fldDue,
    u.fldStatus,
    (SELECT GROUP_CONCAT(p.personName ORDER BY p.personName SEPARATOR ', ')
     FROM tblBillOwes bo
     JOIN tblPeople p ON bo.personID = p.personID
     WHERE bo.billID = u.pmkBillID
    ) AS peopleOwing
FROM tblUtilities u
ORDER BY u.fldDue DESC;
        </pre>
        <p>Note: The subquery with `GROUP_CONCAT` lists people currently in `tblBillOwes`. If a bill's `fldStatus` is
            'Paid', `peopleOwing` might be empty or NULL, correctly indicating no one currently owes.</p>
    </section>

</main>
<?php require_once dirname(__DIR__) . '/includes/footer.php' ?>