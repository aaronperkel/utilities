import { RowDataPacket } from "mysql2";
import { query } from "@/lib/db";
import { getRentConfig } from "@/lib/bills";

const EOL = "\r\n";

/** Build the iCalendar feed: monthly rent event + one all-day event per bill due date. */
export async function buildIcs(): Promise<string> {
  const dtstamp =
    new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");

  let ics =
    `BEGIN:VCALENDAR${EOL}VERSION:2.0${EOL}PRODID:-//77 N Union Utilities//EN${EOL}` +
    `X-WR-CALNAME:77 N Union Utilities${EOL}`;

  const rent = await getRentConfig();
  if (rent?.leaseStart && rent?.leaseEnd) {
    const start = rent.leaseStart.replaceAll("-", "");
    const end = rent.leaseEnd.replaceAll("-", "");
    ics +=
      `BEGIN:VEVENT${EOL}UID:RentDueRecurring@77nunion${EOL}DTSTAMP:${dtstamp}${EOL}` +
      `DTSTART;VALUE=DATE:${start}${EOL}RRULE:FREQ=MONTHLY;UNTIL=${end};BYMONTHDAY=1${EOL}` +
      `SUMMARY:🏠 Rent Due${EOL}END:VEVENT${EOL}`;
  }

  const bills = await query<RowDataPacket>(
    `SELECT b.due_date AS dueDate, b.status, t.name AS typeName, t.emoji
     FROM bills b
     JOIN bill_types t ON t.id = b.type_id`,
  );
  for (const row of bills) {
    if (!row.dueDate) continue;
    const due = String(row.dueDate).replaceAll("-", "");
    const paidFlag = row.status === "paid" ? " - PAID" : "";
    ics +=
      `BEGIN:VEVENT${EOL}` +
      `UID:${row.typeName}-${due}@77nunion${EOL}` +
      `DTSTAMP:${dtstamp}${EOL}` +
      `DTSTART;VALUE=DATE:${due}${EOL}` +
      `DTEND;VALUE=DATE:${due}${EOL}` +
      `SUMMARY:${row.emoji} ${row.typeName} Bill Due${paidFlag}${EOL}` +
      `END:VEVENT${EOL}`;
  }

  ics += `END:VCALENDAR${EOL}`;
  return ics;
}
