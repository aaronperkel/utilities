/**
 * scripts/bootstrap-tidb.ts
 *
 * Pre-migration bootstrap: create the `utilities` database and empty schema
 * on TiDB and seed the site-owner people row, so the deployed site renders
 * (with zero bills) before the real webdb migration runs. Safe to run once;
 * refuses to touch a database that already has tables. The full migration
 * (scripts/migrate-to-tidb.ts --force) replaces everything seeded here.
 *
 * Run: npx tsx scripts/bootstrap-tidb.ts
 */

import fs from "node:fs";
import mysql from "mysql2/promise";

for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(new URL(`../${file}`, import.meta.url).pathname);
  } catch {
    /* file not present */
  }
}

async function main() {
  const dbName = process.env.DB_NAME ?? "utilities";
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 4000),
    user: process.env.DB_USER,
    password: process.env.DB_PASS ?? "",
    ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
  });

  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
  await conn.query(`USE \`${dbName}\``);

  const [tables] = await conn.query<mysql.RowDataPacket[]>("SHOW TABLES");
  if (tables.length > 0) {
    console.log(`'${dbName}' already has ${tables.length} table(s) — leaving untouched.`);
    await conn.end();
    return;
  }

  const ddl = fs
    .readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
  for (const stmt of ddl.split(";").map((s) => s.trim()).filter(Boolean)) {
    await conn.query(stmt);
  }

  const ownerUid = (process.env.SITE_OWNER_UID ?? "aperkel").toLowerCase();
  await conn.execute("INSERT INTO people (name, uid, email, is_admin) VALUES (?, ?, ?, 1)", [
    "Aaron",
    ownerUid,
    process.env.APP_CONFIRMATION_EMAIL_TO?.replace(/"/g, "") ?? "me@aaronperkel.com",
  ]);

  const [t2] = await conn.query<mysql.RowDataPacket[]>("SHOW TABLES");
  const [people] = await conn.query<mysql.RowDataPacket[]>(
    "SELECT id, name, uid, is_admin FROM people",
  );
  console.log("Schema created. Tables:", t2.map((r) => Object.values(r)[0]).join(", "));
  console.log("Seeded owner:", JSON.stringify(people[0]));
  await conn.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
