import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { RowDataPacket } from "mysql2";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

// Public JSON API for unpaid bills: X-Api-Key auth plus optional HMAC
// (X-Timestamp + X-Signature over "METHOD\nPATH\nTIMESTAMP\nBODY").
export async function GET(req: NextRequest) {
  const apiKey = process.env.API_KEY ?? "";
  const hmacKey = process.env.HMAC_KEY;

  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "server config missing" }, { status: 500 });
  }

  const gotKey = req.headers.get("x-api-key") ?? "";
  if (
    gotKey.length !== apiKey.length ||
    !crypto.timingSafeEqual(Buffer.from(apiKey), Buffer.from(gotKey))
  ) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  if (hmacKey) {
    const ts = req.headers.get("x-timestamp") ?? "";
    const sig = req.headers.get("x-signature") ?? "";
    if (!ts || !sig) {
      return NextResponse.json({ ok: false, error: "missing hmac headers" }, { status: 401 });
    }
    if (Math.abs(Date.now() / 1000 - parseInt(ts, 10)) > 300) {
      return NextResponse.json({ ok: false, error: "timestamp skew" }, { status: 401 });
    }
    const path = req.nextUrl.pathname + req.nextUrl.search;
    const base = `${req.method}\n${path}\n${ts}\n`;
    const want = crypto.createHmac("sha256", hmacKey).update(base).digest("base64");
    if (
      want.length !== sig.length ||
      !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(sig))
    ) {
      return NextResponse.json({ ok: false, error: "bad signature" }, { status: 401 });
    }
  }

  try {
    const totalRows = await query<RowDataPacket>(
      `SELECT COALESCE(SUM(b.per_person_cost),0) AS totalOutstanding
       FROM bills b
       JOIN bill_debts d ON b.id = d.bill_id
       WHERE b.status = 'unpaid'`,
    );
    const totalOutstanding = Number(totalRows[0]?.totalOutstanding ?? 0);

    const perPersonRows = await query<RowDataPacket>(
      `SELECT p.name AS personName, COALESCE(SUM(b.per_person_cost),0) AS totalOwedByPerson
       FROM bills b
       JOIN bill_debts d ON b.id = d.bill_id
       JOIN people p ON d.person_id = p.id
       WHERE b.status = 'unpaid'
       GROUP BY p.name
       ORDER BY p.name`,
    );
    const perPerson = perPersonRows.map((r) => ({
      personName: r.personName,
      totalOwedByPerson: Number(r.totalOwedByPerson),
    }));

    const detailRows = await query<RowDataPacket>(
      `SELECT b.id AS billID, t.name AS item, b.total AS billTotal,
              b.per_person_cost AS perPersonCost, b.due_date AS dueDate, p.name AS personOwing
       FROM bills b
       JOIN bill_types t ON t.id = b.type_id
       JOIN bill_debts d ON b.id = d.bill_id
       JOIN people p ON d.person_id = p.id
       WHERE b.status = 'unpaid'
       ORDER BY b.due_date, b.id, p.name`,
    );
    const detail = detailRows.map((r) => ({
      billID: Number(r.billID),
      item: r.item,
      billTotal: Number(r.billTotal),
      perPersonCost: Number(r.perPersonCost),
      dueDate: r.dueDate,
      personOwing: r.personOwing,
    }));

    return NextResponse.json({ ok: true, totalOutstanding, perPerson, detail });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: "query failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
