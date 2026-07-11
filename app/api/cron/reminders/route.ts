import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  getReminderConfig,
  markReminderRun,
  nyDate,
  nyHour,
  runReminderBatch,
} from "@/lib/reminders";

// The batch sleeps 1s between emails, so a busy day can exceed the default
// function timeout.
export const maxDuration = 60;

// Hourly tick (GitHub Actions; a Vercel Cron would send the same header).
// The endpoint owns the schedule: it reads reminder_config and only sends
// during the configured hour, at most once per NY calendar day.
function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET is not configured" },
      { status: 500 },
    );
  }
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const config = await getReminderConfig();
  await markReminderRun();

  if (!config) {
    return NextResponse.json(
      { ok: false, error: "reminder_config table is missing or empty" },
      { status: 500 },
    );
  }
  if (!config.enabled) {
    return NextResponse.json({ ok: true, skipped: "reminders are disabled" });
  }

  const hour = nyHour();
  const today = nyDate();
  if (hour !== config.sendHour) {
    return NextResponse.json({
      ok: true,
      skipped: `waiting for ${config.sendHour}:00 ET (currently ${hour}:xx ET)`,
    });
  }
  if (config.lastSendDate === today) {
    return NextResponse.json({ ok: true, skipped: "already ran today" });
  }

  const result = await runReminderBatch(config);
  return NextResponse.json({ ok: true, ...result });
}
