"use client";

import { useState } from "react";
import { removeBillType, saveBillType } from "@/app/portal/actions";

export interface BillTypeDetail {
  id: number;
  name: string;
  emoji: string;
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
    <section className="mt-8">
      <div className="mb-2 flex items-center gap-3">
        <span className="eyebrow">Bill types</span>
        <span className="h-px flex-1 bg-line-soft" aria-hidden="true" />
        <button type="button" className="btn btn-sm" onClick={() => setModal({ mode: "add" })}>
          + Add type
        </button>
      </div>

      <div className="panel overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Type</th>
              <th className="num">Processing fee</th>
              <th className="num">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {billTypes.map((bt) => (
              <tr key={bt.id}>
                <td className="font-medium">
                  {bt.emoji} {bt.name}
                </td>
                <td className="num figure text-ink-muted">
                  ${Number(bt.processingFee).toFixed(2)}
                </td>
                <td className="num">
                  <div className="flex justify-end gap-1.5">
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => setModal({ mode: "edit", billType: bt })}
                    >
                      Edit
                    </button>
                    <form
                      action={removeBillType}
                      onSubmit={(e) => {
                        if (!confirm(`Remove ${bt.name}?`)) e.preventDefault();
                      }}
                      className="inline"
                    >
                      <input type="hidden" name="billtype_id" value={bt.id} />
                      <button type="submit" className="btn btn-sm">
                        Remove
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
            {billTypes.length === 0 && (
              <tr>
                <td colSpan={3} className="text-center text-ink-muted">
                  No bill types configured.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modal.mode !== "closed" && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModal({ mode: "closed" });
          }}
        >
          <div className="panel w-full max-w-md p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-bold">
              {editing ? "Edit bill type" : "Add bill type"}
            </h3>
            <form action={saveBillType}>
              <input type="hidden" name="billtype_action" value={editing ? "edit" : "add"} />
              {editing && <input type="hidden" name="billtype_id" value={editing.id} />}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="field-label" htmlFor="billtype_name">Name</label>
                  <input
                    className="field-input"
                    id="billtype_name"
                    name="billtype_name"
                    placeholder="e.g. Water"
                    defaultValue={editing?.name ?? ""}
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
                    defaultValue={editing?.emoji ?? ""}
                    required
                  />
                </div>
              </div>
              <div className="mt-4">
                <label className="field-label" htmlFor="billtype_fee">Processing fee</label>
                <input
                  className="field-input figure"
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
                <button type="button" className="btn" onClick={() => setModal({ mode: "closed" })}>
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
