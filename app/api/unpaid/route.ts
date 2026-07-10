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
      `SELECT COALESCE(SUM(u.fldCost),0) AS totalOutstanding
       FROM tblUtilities u
       JOIN tblBillOwes bo ON u.pmkBillID = bo.billID
       WHERE u.fldStatus = 'Unpaid'`,
    );
    const totalOutstanding = Number(totalRows[0]?.totalOutstanding ?? 0);

    const perPersonRows = await query<RowDataPacket>(
      `SELECT p.personName, COALESCE(SUM(u.fldCost),0) AS totalOwedByPerson
       FROM tblUtilities u
       JOIN tblBillOwes bo ON u.pmkBillID = bo.billID
       JOIN tblPeople p ON bo.personID = p.personID
       WHERE u.fldStatus = 'Unpaid'
       GROUP BY p.personName
       ORDER BY p.personName`,
    );
    const perPerson = perPersonRows.map((r) => ({
      personName: r.personName,
      totalOwedByPerson: Number(r.totalOwedByPerson),
    }));

    const detailRows = await query<RowDataPacket>(
      `SELECT u.pmkBillID AS billID, u.fldItem AS item, u.fldTotal AS billTotal,
              u.fldCost AS perPersonCost, u.fldDue AS dueDate, p.personName AS personOwing
       FROM tblUtilities u
       JOIN tblBillOwes bo ON u.pmkBillID = bo.billID
       JOIN tblPeople p ON bo.personID = p.personID
       WHERE u.fldStatus = 'Unpaid'
       ORDER BY u.fldDue, u.pmkBillID, p.personName`,
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
