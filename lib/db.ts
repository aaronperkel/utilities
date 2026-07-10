import fs from "node:fs";
import mysql, { Pool, RowDataPacket, ResultSetHeader } from "mysql2/promise";

let pool: Pool | undefined;

export function getPool(): Pool {
  if (!pool) {
    const useSsl = (process.env.DB_USE_SSL ?? "false").toLowerCase() === "true";
    const caPath = process.env.DB_SSL_CA_PATH;

    let ssl: { ca: Buffer } | { rejectUnauthorized: false } | undefined;
    if (useSsl) {
      ssl =
        caPath && fs.existsSync(caPath)
          ? { ca: fs.readFileSync(caPath) }
          : { rejectUnauthorized: false };
    }

    pool = mysql.createPool({
      host: process.env.DB_HOST ?? "webdb.uvm.edu",
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASS,
      ssl,
      waitForConnections: true,
      connectionLimit: 5,
      // Match the PHP app: DATE columns as 'YYYY-MM-DD' strings, DECIMALs as numbers
      dateStrings: true,
      decimalNumbers: true,
    });
  }
  return pool;
}

export type SqlParam = string | number | boolean | null | Buffer | Date;

export async function query<T extends RowDataPacket>(
  sql: string,
  params: SqlParam[] = [],
): Promise<T[]> {
  const [rows] = await getPool().query<T[]>(sql, params);
  return rows;
}

export async function execute(
  sql: string,
  params: SqlParam[] = [],
): Promise<ResultSetHeader> {
  const [result] = await getPool().execute<ResultSetHeader>(sql, params);
  return result;
}
