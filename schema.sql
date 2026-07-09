-- schema.sql
-- Database schema for 77 N Union Utilities (APERKEL_utilities)

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------

CREATE TABLE tblPeople (
    personID   INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
    personName VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE tblUtilities (
    pmkBillID INT            NOT NULL AUTO_INCREMENT PRIMARY KEY,
    fldDate    DATE          DEFAULT NULL,
    fldItem    VARCHAR(50)   DEFAULT NULL,  -- 'Gas', 'Electric', 'Internet'
    fldTotal   DECIMAL(10,2) DEFAULT NULL,  -- total bill amount
    fldCost    DECIMAL(10,2) DEFAULT NULL,  -- per-person share (equal split)
    fldDue     DATE          DEFAULT NULL,
    fldStatus  VARCHAR(10)   DEFAULT NULL,  -- 'Unpaid' | 'Paid'
    fldView    VARCHAR(255)  DEFAULT NULL   -- relative path to the bill PDF
);

CREATE TABLE tblBillOwes (
    billID   INT NOT NULL,
    personID INT NOT NULL,
    PRIMARY KEY (billID, personID),
    FOREIGN KEY (billID)   REFERENCES tblUtilities(pmkBillID) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (personID) REFERENCES tblPeople(personID)     ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE tblRentConfig (
    id          INT            NOT NULL AUTO_INCREMENT PRIMARY KEY,
    rentAmount  DECIMAL(10,2)  NOT NULL DEFAULT 0,
    startDate   DATE           NOT NULL,
    endDate     DATE           NOT NULL
);

-- -----------------------------------------------------------------------------
-- Seed data
-- -----------------------------------------------------------------------------

INSERT INTO tblPeople (personName) VALUES ('Aaron'), ('Owen'), ('Ben');

-- -----------------------------------------------------------------------------
-- Useful queries
-- -----------------------------------------------------------------------------

-- Who owes for a specific bill?
SELECT p.personName
FROM tblPeople p
JOIN tblBillOwes bo ON p.personID = bo.personID
WHERE bo.billID = 1;

-- All unpaid bills for a person
SELECT u.fldItem, u.fldCost, u.fldDue
FROM tblUtilities u
JOIN tblBillOwes bo ON u.pmkBillID = bo.billID
JOIN tblPeople   p  ON bo.personID = p.personID
WHERE p.personName = 'Ben'
  AND u.fldStatus <> 'Paid';

-- Each bill with comma-separated debtors
SELECT
    u.fldItem,
    u.fldDue,
    u.fldStatus,
    (
        SELECT GROUP_CONCAT(p.personName ORDER BY p.personName SEPARATOR ', ')
        FROM tblBillOwes bo
        JOIN tblPeople p ON bo.personID = p.personID
        WHERE bo.billID = u.pmkBillID
    ) AS peopleOwing
FROM tblUtilities u
ORDER BY u.fldDue DESC;
