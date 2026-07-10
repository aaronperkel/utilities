"use client";

import { useState } from "react";
import { removePerson, savePerson } from "@/app/portal/actions";

export interface PersonDetail {
  id: number;
  name: string;
  uid: string | null;
  email: string | null;
  isAdmin: number;
}

type ModalState =
  | { mode: "closed" }
  | { mode: "add" }
  | { mode: "edit"; person: PersonDetail };

export default function UsersSection({ people }: { people: PersonDetail[] }) {
  const [modal, setModal] = useState<ModalState>({ mode: "closed" });
  const editing = modal.mode === "edit" ? modal.person : null;

  return (
    <section className="mt-10">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="section-title mb-0!">Manage Users</h2>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setModal({ mode: "add" })}>
          + Add User
        </button>
      </div>

      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Login ID</th>
              <th>Email</th>
              <th>Admin</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.id}>
                <td className="font-semibold">{p.name}</td>
                <td className="text-ink-muted">{p.uid ?? ""}</td>
                <td className="text-ink-muted">{p.email ?? ""}</td>
                <td>
                  {p.isAdmin ? (
                    <span className="badge badge-paid">Admin</span>
                  ) : (
                    <span className="text-ink-muted">—</span>
                  )}
                </td>
                <td>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => setModal({ mode: "edit", person: p })}
                    >
                      Edit
                    </button>
                    <form
                      action={removePerson}
                      onSubmit={(e) => {
                        if (!confirm(`Remove ${p.name}?`)) e.preventDefault();
                      }}
                      className="inline"
                    >
                      <input type="hidden" name="person_id" value={p.id} />
                      <button type="submit" className="btn btn-outline btn-sm">
                        Remove
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
            {people.length === 0 && (
              <tr>
                <td colSpan={5} className="text-ink-muted">
                  No users found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modal.mode !== "closed" && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModal({ mode: "closed" });
          }}
        >
          <div className="card w-full max-w-md p-6">
            <h3 className="mb-4 text-lg font-bold">
              {editing ? "Edit User" : "Add User"}
            </h3>
            <form action={savePerson}>
              <input type="hidden" name="person_action" value={editing ? "edit" : "add"} />
              {editing && <input type="hidden" name="person_id" value={editing.id} />}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="field-label" htmlFor="person_name">Name</label>
                  <input
                    className="field-input"
                    id="person_name"
                    name="person_name"
                    defaultValue={editing?.name ?? ""}
                    required
                    autoFocus
                  />
                </div>
                <div>
                  <label className="field-label" htmlFor="person_uid">Login ID</label>
                  <input
                    className="field-input"
                    id="person_uid"
                    name="person_uid"
                    defaultValue={editing?.uid ?? ""}
                    required
                  />
                </div>
              </div>
              <div className="mt-4">
                <label className="field-label" htmlFor="person_email">Email</label>
                <input
                  className="field-input"
                  type="email"
                  id="person_email"
                  name="person_email"
                  defaultValue={editing?.email ?? ""}
                  required
                />
              </div>
              <label className="mt-4 inline-flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="person_is_admin"
                  value="1"
                  className="accent-[#3b82f6]"
                  defaultChecked={!!editing?.isAdmin}
                />
                <span>Admin access</span>
              </label>
              <div className="mt-6 flex gap-2">
                <button type="submit" className="btn btn-primary">Save</button>
                <button type="button" className="btn btn-outline" onClick={() => setModal({ mode: "closed" })}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
