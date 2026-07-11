/**
 * scripts/send-reminders.ts
 *
 * Manual/CLI entry for the reminder batch. The scheduled path is the hourly
 * cron hitting app/api/cron/reminders (GitHub Actions); both share
 * lib/reminders.ts. Offsets come from reminder_config (portal → Household →
 * Reminders), falling back to the classic 7-day heads-up / ≤3-day urgent.
 *
 * Run: npm run send-reminders   (or: npx tsx scripts/send-reminders.ts)
 *
 * Note: running this counts as the day's batch (it stamps last_send_date),
 * so the cron will not send a second round the same day.
 */

// Load env the same way Next does (best effort — fine if files are missing)
for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(new URL(`../${file}`, import.meta.url).pathname);
  } catch {
    /* file not present */
  }
}

import { getPool } from "../lib/db";
import { getReminderConfig, runReminderBatch } from "../lib/reminders";

async function main() {
  console.log("========== Checking Bills ==========");
  console.log("Started:", new Date().toISOString());

  const config = await getReminderConfig();
  if (!config) console.log("No reminder_config row — using default 7/3-day offsets.");

  const result = await runReminderBatch({
    firstReminderDays: config?.firstReminderDays ?? 7,
    urgentReminderDays: config?.urgentReminderDays ?? 3,
  });

  console.log("---------- Summary ----------");
  console.log(`Checked: ${result.checked} | Sent: ${result.sent} | Failed: ${result.failed}`);
  console.log("Done:", new Date().toISOString());
  console.log("====================================");
}

main()
  .then(() => getPool().end())
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
