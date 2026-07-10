import { NextResponse } from "next/server";
import { getCurrentPerson } from "@/lib/auth";
import { getMonthlyTotals, lastYearSeries } from "@/lib/trends";

// Full-history CSV export (Month, Gas, Electric, and same-month-last-year columns).
export async function GET() {
  const person = await getCurrentPerson();
  if (!person) return new NextResponse("Forbidden", { status: 403 });

  const { labels, monthly } = await getMonthlyTotals();
  const gasLY = lastYearSeries(labels, monthly, "Gas");
  const elecLY = lastYearSeries(labels, monthly, "Electric");

  const lines = ["Month,Gas,Electric,Gas Last Year,Electric Last Year"];
  labels.forEach((label, i) => {
    const row = monthly.get(label);
    lines.push(
      [
        label,
        row?.Gas ?? "",
        row?.Electric ?? "",
        gasLY[i] ?? "",
        elecLY[i] ?? "",
      ].join(","),
    );
  });

  return new NextResponse(lines.join("\n") + "\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="utilities-trends.csv"',
    },
  });
}
