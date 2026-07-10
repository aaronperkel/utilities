"use client";

import { sendReminder } from "@/app/portal/actions";
import { EnvelopeIcon } from "@/app/components/icons";

export default function ReminderButton({ billId }: { billId: number }) {
  return (
    <form
      action={sendReminder}
      onSubmit={(e) => {
        if (!confirm("Send reminder email to all unpaid users?")) e.preventDefault();
      }}
      className="inline"
    >
      <input type="hidden" name="billId" value={billId} />
      <button type="submit" className="btn-icon" title="Send reminder email" aria-label="Send reminder">
        <EnvelopeIcon />
      </button>
    </form>
  );
}
