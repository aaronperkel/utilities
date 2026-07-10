"use client";

import { useState, useTransition } from "react";
import { updateOwes } from "@/app/portal/actions";

interface PersonRef {
  id: number;
  name: string;
}

/** Auto-saving per-person payment checkboxes (port of the sticky checkboxes in app.js). */
export default function PaymentCheckboxes({
  billId,
  people,
  initialPaidIds,
}: {
  billId: number;
  people: PersonRef[];
  initialPaidIds: number[];
}) {
  const [paidIds, setPaidIds] = useState<Set<number>>(new Set(initialPaidIds));
  const [pending, startTransition] = useTransition();

  function toggle(personId: number, checked: boolean) {
    const next = new Set(paidIds);
    if (checked) next.add(personId);
    else next.delete(personId);
    const previous = paidIds;
    setPaidIds(next);

    startTransition(async () => {
      const result = await updateOwes(billId, [...next]);
      if (!result.ok) {
        setPaidIds(previous);
        alert(result.error ?? "Failed to save. Please try again.");
      }
    });
  }

  return (
    <div className={`flex flex-wrap gap-x-4 gap-y-1 ${pending ? "opacity-60" : ""}`}>
      {people.map((p) => (
        <label key={p.id} className="inline-flex cursor-pointer items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            className="accent-[#3b82f6]"
            checked={paidIds.has(p.id)}
            onChange={(e) => toggle(p.id, e.target.checked)}
          />
          <span>{p.name}</span>
        </label>
      ))}
    </div>
  );
}
