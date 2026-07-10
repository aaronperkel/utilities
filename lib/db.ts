import fs from "node:fs";
import mysql, { Pool, RowDataPacket, ResultSetHeader } from "mysql2/promise";

let pool: Pool | undefined;

export function getPool(): Pool {
  if (!pool) {
    const useSsl = (process.env.DB_USE_SSL ?? "true").toLowerCase() === "true";
    const caPath = process.env.DB_SSL_CA_PATH;

    // TiDB Cloud Serverless requires TLS; its certs chain to public CAs, so
    // the default verifying config works without a CA file.
    let ssl: { ca: Buffer } | { minVersion: string; rejectUnauthorized: true } | undefined;
    if (useSsl) {
      ssl =
        caPath && fs.existsSync(caPath)
          ? { ca: fs.readFileSync(caPath) }
          : { minVersion: "TLSv1.2", rejectUnauthorized: true };
    }

    pool = mysql.createPool({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT ?? 4000),
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
