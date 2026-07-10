"use client";

import { useActionState, useMemo, useState } from "react";
import { addBill, AddBillState } from "@/app/portal/actions";

interface TypeOption {
  name: string;
  emoji: string;
  processingFee: number;
}

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
  const [type, setType] = useState("");
  const [amount, setAmount] = useState("");

  const fee = useMemo(
    () => billTypes.find((t) => t.name === type)?.processingFee ?? 0,
    [billTypes, type],
  );
  const base = parseFloat(amount) || 0;
  const total = base + Number(fee);
  const cost = peopleCount > 0 ? Math.round((total / peopleCount) * 100) / 100 : 0;

  return (
    <div className="form-panel mb-8">
      {state.errors.length > 0 && (
        <div className="mb-4 rounded-(--radius-sm) border border-unpaid/40 bg-unpaid/10 px-4 py-3 text-sm">
          <strong>Please correct the following errors:</strong>
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
              Bill Date
            </label>
            <input className="field-input" type="date" id="date" name="date" required />
          </div>
          <div>
            <label className="field-label" htmlFor="due">
              Due Date
            </label>
            <input className="field-input" type="date" id="due" name="due" required />
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <label className="field-label" htmlFor="amount">
              Bill Amount
            </label>
            <input
              className="field-input"
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
                <small className="text-ink-muted font-normal">
                  (+${Number(fee).toFixed(2)} fee)
                </small>
              )}
            </label>
            <input
              className="field-input opacity-70"
              type="text"
              readOnly
              value={base > 0 ? total.toFixed(2) : ""}
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="field-label">Per Person</label>
            <input
              className="field-input opacity-70"
              type="text"
              readOnly
              value={base > 0 ? cost.toFixed(2) : ""}
              placeholder="0.00"
            />
          </div>
        </div>

        <div className="mt-4">
          <label className="field-label" htmlFor="view">
            PDF Statement
          </label>
          <input
            className="field-input"
            type="file"
            id="view"
            name="view"
            accept="application/pdf"
            required
          />
          <small className="text-xs text-ink-muted">Max 5MB</small>
        </div>

        <div className="mt-5">
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? "Submitting…" : "Submit New Bill"}
          </button>
        </div>
      </form>
    </div>
  );
}
