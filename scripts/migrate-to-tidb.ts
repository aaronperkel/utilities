/**
 * scripts/migrate-to-tidb.ts
 *
 * One-time data migration: UVM webdb (legacy PHP-era schema) → TiDB Cloud
 * Serverless (new schema in db/schema.sql). Run from the UVM network/VPN so
 * both databases are reachable.
 *
 * Env (in .env.local):
 *   SRC_DB_HOST / SRC_DB_NAME / SRC_DB_USER / SRC_DB_PASS   — legacy webdb
 *   DB_HOST / DB_PORT / DB_NAME / DB_USER / DB_PASS         — TiDB (the app's normal vars)
 *
 * Transforms:
 *   tblPeople    → people      (ids preserved)
 *   tblBillTypes → bill_types  (ids preserved; missing types referenced by
 *                               bills are created with 📄 / $0 fee)
 *   tblUtilities → bills       (fldItem name → type_id, status lowercased,
 *                               'public/' prefix stripped from pdf paths)
 *   tblBillOwes  → bill_debts
 *   tblRentConfig→ rent_config
 *
 * Run: npx tsx scripts/migrate-to-tidb.ts          (aborts if TiDB already has tables)
 *      npx tsx scripts/migrate-to-tidb.ts --force  (drops and recreates them first)
 */

import fs from "node:fs";
import mysql, { Connection, RowDataPacket } from "mysql2/promise";

for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(new URL(`../${file}`, import.meta.url).pathname);
  } catch {
    /* file not present */
  }
}

const FORCE = process.argv.includes("--force");

function need(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return v;
}

async function connectSource(): Promise<Connection> {
  return mysql.createConnection({
    host: need("SRC_DB_HOST"),
    port: Number(process.env.SRC_DB_PORT ?? 3306),
    database: need("SRC_DB_NAME"),
    user: need("SRC_DB_USER"),
    password: process.env.SRC_DB_PASS ?? "",
    dateStrings: true,
    decimalNumbers: true,
  });
}

async function connectDest(): Promise<Connection> {
  const useSsl = (process.env.DB_USE_SSL ?? "true").toLowerCase() === "true";
  return mysql.createConnection({
    host: need("DB_HOST"),
    port: Number(process.env.DB_PORT ?? 4000),
    user: need("DB_USER"),
    password: process.env.DB_PASS ?? "",
    ssl: useSsl ? { minVersion: "TLSv1.2", rejectUnauthorized: true } : undefined,
    dateStrings: true,
    decimalNumbers: true,
  });
}

async function rows(conn: Connection, sql: string): Promise<RowDataPacket[]> {
  const [r] = await conn.query<RowDataPacket[]>(sql);
  return r;
}

async function main() {
  const dbName = need("DB_NAME");

  console.log("Connecting to source (webdb)...");
  const src = await connectSource();
  console.log("Connecting to destination (TiDB)...");
  const dest = await connectDest();

  await dest.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
  await dest.query(`USE \`${dbName}\``);

  const existing = await rows(dest, "SHOW TABLES");
  if (existing.length > 0 && !FORCE) {
    console.error(
      `Destination database '${dbName}' is not empty (${existing.length} table(s)). ` +
        "Re-run with --force to drop and recreate.",
    );
    process.exit(1);
  }
  for (const t of ["bill_debts", "bills", "bill_types", "people", "rent_config"]) {
    await dest.query(`DROP TABLE IF EXISTS \`${t}\``);
  }

  console.log("Creating schema from db/schema.sql...");
  const ddl = fs
    .readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
  for (const stmt of ddl.split(";").map((s) => s.trim()).filter(Boolean)) {
    await dest.query(stmt);
  }

  // ---- read everything from the legacy schema ----
  const people = await rows(src, "SELECT personID, personName, uid, email, is_admin FROM tblPeople");
  const types = await rows(src, "SELECT typeID, typeName, typeEmoji, processingFee FROM tblBillTypes");
  const bills = await rows(
    src,
    "SELECT pmkBillID, fldDate, fldItem, fldTotal, fldCost, fldDue, fldStatus, fldView FROM tblUtilities",
  );
  const owes = await rows(src, "SELECT billID, personID FROM tblBillOwes");
  const rent = await rows(src, "SELECT id, rentAmount, startDate, endDate FROM tblRentConfig");

  // ---- sanity: the new schema requires these to be present ----
  const bad = bills.filter(
    (b) => !b.fldDate || !b.fldItem || !b.fldDue || b.fldTotal == null || b.fldCost == null,
  );
  if (bad.length > 0) {
    console.error("These legacy bills have NULLs the new schema rejects; fix them first:");
    for (const b of bad) console.error(`  pmkBillID=${b.pmkBillID}`, b);
    process.exit(1);
  }

  // ---- people (ids preserved) ----
  for (const p of people) {
    await dest.execute("INSERT INTO people (id, name, uid, email, is_admin) VALUES (?, ?, ?, ?, ?)", [
      p.personID,
      p.personName,
      p.uid,
      p.email,
      p.is_admin ? 1 : 0,
    ]);
  }
  console.log(`people: ${people.length} row(s)`);

  // ---- bill types (ids preserved; synthesize any type a bill references) ----
  const typeIdByName = new Map<string, number>();
  for (const t of types) {
    await dest.execute("INSERT INTO bill_types (id, name, emoji, processing_fee) VALUES (?, ?, ?, ?)", [
      t.typeID,
      t.typeName,
      t.typeEmoji,
      t.processingFee ?? 0,
    ]);
    typeIdByName.set(t.typeName, Number(t.typeID));
  }
  const missing = [...new Set(bills.map((b) => String(b.fldItem)))].filter(
    (name) => !typeIdByName.has(name),
  );
  for (const name of missing) {
    const [res] = await dest.execute("INSERT INTO bill_types (name, emoji, processing_fee) VALUES (?, '📄', 0)", [
      name,
    ]);
    typeIdByName.set(name, (res as mysql.ResultSetHeader).insertId);
    console.log(`bill_types: created missing type '${name}' referenced by legacy bills`);
  }
  console.log(`bill_types: ${types.length + missing.length} row(s)`);

  // ---- bills (ids preserved) ----
  for (const b of bills) {
    await dest.execute(
      `INSERT INTO bills (id, type_id, bill_date, due_date, total, per_person_cost, status, pdf_path)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        b.pmkBillID,
        typeIdByName.get(String(b.fldItem)),
        b.fldDate,
        b.fldDue,
        b.fldTotal,
        b.fldCost,
        String(b.fldStatus).toLowerCase() === "paid" ? "paid" : "unpaid",
        b.fldView ? String(b.fldView).replace(/^public\//, "") : null,
      ],
    );
  }
  console.log(`bills: ${bills.length} row(s)`);

  // ---- outstanding shares ----
  for (const o of owes) {
    await dest.execute("INSERT INTO bill_debts (bill_id, person_id) VALUES (?, ?)", [
      o.billID,
      o.personID,
    ]);
  }
  console.log(`bill_debts: ${owes.length} row(s)`);

  // ---- rent config ----
  for (const r of rent) {
    await dest.execute(
      "INSERT INTO rent_config (id, monthly_rent, lease_start, lease_end) VALUES (?, ?, ?, ?)",
      [r.id, r.rentAmount, r.startDate, r.endDate],
    );
  }
  console.log(`rent_config: ${rent.length} row(s)`);

  // ---- verify ----
  console.log("\n---------- Verification ----------");
  const checks: [string, string, string][] = [
    ["people", "SELECT COUNT(*) AS n FROM tblPeople", "SELECT COUNT(*) AS n FROM people"],
    ["bills", "SELECT COUNT(*) AS n FROM tblUtilities", "SELECT COUNT(*) AS n FROM bills"],
    ["bill_debts", "SELECT COUNT(*) AS n FROM tblBillOwes", "SELECT COUNT(*) AS n FROM bill_debts"],
    [
      "bill total sum",
      "SELECT COALESCE(SUM(fldTotal),0) AS n FROM tblUtilities",
      "SELECT COALESCE(SUM(total),0) AS n FROM bills",
    ],
    [
      "unpaid bills",
      "SELECT COUNT(*) AS n FROM tblUtilities WHERE fldStatus <> 'Paid'",
      "SELECT COUNT(*) AS n FROM bills WHERE status <> 'paid'",
    ],
  ];
  let allOk = true;
  for (const [label, srcSql, destSql] of checks) {
    const a = Number((await rows(src, srcSql))[0].n);
    const b = Number((await rows(dest, destSql))[0].n);
    const ok = a === b;
    allOk &&= ok;
    console.log(`${ok ? "OK  " : "FAIL"} ${label}: src=${a} dest=${b}`);
  }

  await src.end();
  await dest.end();

  if (!allOk) {
    console.error("\nVerification FAILED — do not point the app at TiDB yet.");
    process.exit(1);
  }
  console.log("\nMigration complete. Point DB_* at TiDB (already done if you ran this) and verify the app.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
