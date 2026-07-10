"use client";

import { useActionState } from "react";
import { CustomEmailState, sendCustomEmail } from "@/app/email/actions";

export default function CustomEmailForm() {
  const [state, formAction, pending] = useActionState<CustomEmailState, FormData>(
    sendCustomEmail,
    { errors: [] },
  );

  return (
    <div className="form-panel">
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
        <label className="field-label" htmlFor="subject">
          Subject
        </label>
        <input
          className="field-input"
          type="text"
          id="subject"
          name="subject"
          defaultValue={state.subject ?? ""}
          required
        />
        <label className="field-label mt-4" htmlFor="body">
          Message
        </label>
        <textarea
          className="field-input"
          id="body"
          name="body"
          rows={6}
          defaultValue={state.body ?? ""}
          required
        />
        <button type="submit" className="btn btn-primary mt-5" disabled={pending}>
          {pending ? "Sending…" : "Send Email"}
        </button>
      </form>
    </div>
  );
}
