"use client";

import { useActionState } from "react";
import { CustomEmailState, sendCustomEmail } from "@/app/portal/email/actions";

export default function CustomEmailForm() {
  const [state, formAction, pending] = useActionState<CustomEmailState, FormData>(
    sendCustomEmail,
    { errors: [] },
  );

  return (
    <div className="panel p-5">
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
          {pending ? "Sending…" : "Send to everyone"}
        </button>
      </form>
    </div>
  );
}
