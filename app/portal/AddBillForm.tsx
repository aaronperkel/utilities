"use client";

import { useActionState, useMemo, useState } from "react";
import { addBill, AddBillState } from "@/app/portal/actions";

interface TypeOption {
  name: string;
  emoji: string;
  processingFee: number;
}

/**
 * "Bills" section header with the add-bill form collapsed behind the button;
 * stays open while validation errors are showing.
 */
export default function AddBillForm({
  billTypes,
  peopleCount,
}: {
  billTypes: TypeOption[];
  peopleCount: number;
}) {
  const [state, formAction, pending] = useActionState<AddBillState, FormData>(
    addBill,
    { errors: [] },
  );
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [type, setType] = useState("");
  const [amount, setAmount] = useState("");
  const show = open || (state.errors.length > 0 && !dismissed);

  function toggle(next: boolean) {
    setOpen(next);
    setDismissed(!next);
  }

  const fee = useMemo(
    () => billTypes.find((t) => t.name === type)?.processingFee ?? 0,
    [billTypes, type],
  );
  const base = parseFloat(amount) || 0;
  const total = base + Number(fee);
  const cost = peopleCount > 0 ? Math.round((total / peopleCount) * 100) / 100 : 0;

  return (
    <div className="mb-2">
      <div className="mb-2 flex items-center gap-3">
        <span className="eyebrow">Bills</span>
        <span className="h-px flex-1 bg-line-soft" aria-hidden="true" />
        <button
          type="button"
          className={`btn btn-sm ${show ? "" : "btn-primary"}`}
          aria-expanded={show}
          onClick={() => toggle(!show)}
        >
          {show ? "Close" : "+ Add bill"}
        </button>
      </div>

      {show && (
        <div className="panel mb-5 p-5">
          {state.errors.length > 0 && (
            <div className="flash flash-err">
              <strong>Please correct the following:</strong>
              <ul className="mt-1 list-disc pl-5">
                {state.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          )}

          <form action={formAction}>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="field-label" htmlFor="type">
                  Type
                </label>
                <select
                  id="type"
                  name="type"
                  required
                  className="field-input"
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                >
                  <option value="" disabled>
                    Select...
                  </option>
                  {billTypes.map((t) => (
                    <option key={t.name} value={t.name}>
                      {t.emoji} {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label" htmlFor="date">
                  Bill date
                </label>
                <input className="field-input figure" type="date" id="date" name="date" required />
              </div>
              <div>
                <label className="field-label" htmlFor="due">
                  Due date
                </label>
                <input className="field-input figure" type="date" id="due" name="due" required />
              </div>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <div>
                <label className="field-label" htmlFor="amount">
                  Amount
                </label>
                <input
                  className="field-input figure"
                  type="number"
                  id="amount"
                  name="amount"
                  step="0.01"
                  placeholder="0.00"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div>
                <label className="field-label">
                  Total{" "}
                  {fee > 0 && (
                    <small className="font-normal text-ink-muted">
                      (+${Number(fee).toFixed(2)} fee)
                    </small>
                  )}
                </label>
                <input
                  className="field-input figure opacity-70"
                  type="text"
                  readOnly
                  tabIndex={-1}
                  value={base > 0 ? total.toFixed(2) : ""}
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="field-label">Per person</label>
                <input
                  className="field-input figure opacity-70"
                  type="text"
                  readOnly
                  tabIndex={-1}
                  value={base > 0 ? cost.toFixed(2) : ""}
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="mt-4">
              <label className="field-label" htmlFor="view">
                PDF statement
              </label>
              <input
                className="field-input"
                type="file"
                id="view"
                name="view"
                accept="application/pdf"
                required
              />
              <small className="text-xs text-ink-muted">Max 5MB. Everyone gets a notification email.</small>
            </div>

            <div className="mt-5 flex gap-2">
              <button type="submit" className="btn btn-primary" disabled={pending}>
                {pending ? "Posting…" : "Post bill"}
              </button>
              <button type="button" className="btn" onClick={() => toggle(false)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
