import { RowDataPacket } from "mysql2";
import { query } from "@/lib/db";
import { getRentConfig } from "@/lib/bills";

const EOL = "\r\n";

const EMOJI: Record<string, string> = {
  Electric: "⚡",
  Gas: "🔥",
  Internet: "🌐",
};

/** Build the iCalendar feed: monthly rent event + one all-day event per bill due date. */
export async function buildIcs(): Promise<string> {
  const dtstamp =
    new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");

  let ics =
    `BEGIN:VCALENDAR${EOL}VERSION:2.0${EOL}PRODID:-//77 N Union Utilities//EN${EOL}` +
    `X-WR-CALNAME:77 N Union Utilities${EOL}`;

  const rent = await getRentConfig();
  if (rent?.startDate && rent?.endDate) {
    const start = rent.startDate.replaceAll("-", "");
    const end = rent.endDate.replaceAll("-", "");
    ics +=
      `BEGIN:VEVENT${EOL}UID:RentDueRecurring@77nunion${EOL}DTSTAMP:${dtstamp}${EOL}` +
      `DTSTART;VALUE=DATE:${start}${EOL}RRULE:FREQ=MONTHLY;UNTIL=${end};BYMONTHDAY=1${EOL}` +
      `SUMMARY:🏠 Rent Due${EOL}END:VEVENT${EOL}`;
  }

  const bills = await query<RowDataPacket>(
    "SELECT fldDue, fldStatus, fldItem FROM tblUtilities",
  );
  for (const row of bills) {
    if (!row.fldDue) continue;
    const due = String(row.fldDue).replaceAll("-", "");
    const paidFlag = String(row.fldStatus).toLowerCase() === "paid" ? " - PAID" : "";
    const emoji = EMOJI[row.fldItem] ?? "";
    ics +=
      `BEGIN:VEVENT${EOL}` +
      `UID:${row.fldItem}-${due}@77nunion${EOL}` +
      `DTSTAMP:${dtstamp}${EOL}` +
      `DTSTART;VALUE=DATE:${due}${EOL}` +
      `DTEND;VALUE=DATE:${due}${EOL}` +
      `SUMMARY:${emoji} ${row.fldItem} Bill Due${paidFlag}${EOL}` +
      `END:VEVENT${EOL}`;
  }

  ics += `END:VCALENDAR${EOL}`;
  return ics;
}
