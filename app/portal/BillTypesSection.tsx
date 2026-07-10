"use client";

import { useState } from "react";
import { removeBillType, saveBillType } from "@/app/portal/actions";

export interface BillTypeDetail {
  typeID: number;
  typeName: string;
  typeEmoji: string;
  processingFee: number;
}

type ModalState =
  | { mode: "closed" }
  | { mode: "add" }
  | { mode: "edit"; billType: BillTypeDetail };

export default function BillTypesSection({ billTypes }: { billTypes: BillTypeDetail[] }) {
  const [modal, setModal] = useState<ModalState>({ mode: "closed" });
  const editing = modal.mode === "edit" ? modal.billType : null;

  return (
    <section className="mt-10">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="section-title mb-0!">Manage Bill Types</h2>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setModal({ mode: "add" })}>
          + Add Type
        </button>
      </div>

      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Emoji</th>
              <th>Processing Fee</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {billTypes.map((bt) => (
              <tr key={bt.typeID}>
                <td className="font-semibold">{bt.typeName}</td>
                <td>{bt.typeEmoji}</td>
                <td className="text-ink-muted">${Number(bt.processingFee).toFixed(2)}</td>
                <td>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => setModal({ mode: "edit", billType: bt })}
                    >
                      Edit
                    </button>
                    <form
                      action={removeBillType}
                      onSubmit={(e) => {
                        if (!confirm(`Remove ${bt.typeName}?`)) e.preventDefault();
                      }}
                      className="inline"
                    >
                      <input type="hidden" name="billtype_id" value={bt.typeID} />
                      <button type="submit" className="btn btn-outline btn-sm">
                        Remove
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
            {billTypes.length === 0 && (
              <tr>
                <td colSpan={4} className="text-ink-muted">
                  No bill types configured.
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
              {editing ? "Edit Bill Type" : "Add Bill Type"}
            </h3>
            <form action={saveBillType}>
              <input type="hidden" name="billtype_action" value={editing ? "edit" : "add"} />
              {editing && <input type="hidden" name="billtype_id" value={editing.typeID} />}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="field-label" htmlFor="billtype_name">Name</label>
                  <input
                    className="field-input"
                    id="billtype_name"
                    name="billtype_name"
                    placeholder="e.g. Water"
                    defaultValue={editing?.typeName ?? ""}
                    required
                    autoFocus
                  />
                </div>
                <div>
                  <label className="field-label" htmlFor="billtype_emoji">Emoji</label>
                  <input
                    className="field-input"
                    id="billtype_emoji"
                    name="billtype_emoji"
                    placeholder="e.g. 💧"
                    defaultValue={editing?.typeEmoji ?? ""}
                    required
                  />
                </div>
              </div>
              <div className="mt-4">
                <label className="field-label" htmlFor="billtype_fee">Processing Fee</label>
                <input
                  className="field-input"
                  type="number"
                  id="billtype_fee"
                  name="billtype_fee"
                  step="0.01"
                  min="0"
                  defaultValue={editing ? Number(editing.processingFee).toFixed(2) : "0.00"}
                  required
                />
              </div>
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
