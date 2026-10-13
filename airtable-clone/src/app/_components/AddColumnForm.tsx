"use client";

import { useId, useState } from "react";
import { api } from "~/trpc/react";

export default function AddColumnForm({ tableId }: { tableId: string }) {
  const id = useId();
  const utils = api.useUtils();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<"TEXT" | "NUMBER">("TEXT");
  const [error, setError] = useState<string | null>(null);
  const mutation = api.column.createColumn.useMutation({
    onMutate: async () => {
      await utils.table.getTableWithColumns.cancel({ tableId });
    },
    onSuccess: (column) => {
      utils.table.getTableWithColumns.setData({ tableId }, (table) =>
        table
          ? {
              ...table,
              columns: [
                ...table.columns.filter(
                  (existing) => existing.id !== column.id,
                ),
                column,
              ].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)),
            }
          : table,
      );
      setName("");
      setType("TEXT");
      setError(null);
      setOpen(false);
    },
    onError: (cause) => setError(cause.message),
  });
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          setOpen(!open);
          setError(null);
        }}
        disabled={mutation.isPending}
        className="rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50 disabled:opacity-50"
      >
        + Add column
      </button>
      {open && (
        <form
          id={id}
          className="mt-3 flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (mutation.isPending) return;
            if (!name.trim()) {
              setError("Enter a column name");
              return;
            }
            setError(null);
            mutation.mutate({ tableId, name: name.trim(), type });
          }}
        >
          <div>
            <label
              htmlFor={`${id}-name`}
              className="mb-1 block text-sm font-medium"
            >
              Column name
            </label>
            <input
              id={`${id}-name`}
              autoFocus
              required
              maxLength={100}
              value={name}
              disabled={mutation.isPending}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Earnings"
              className="rounded border border-slate-300 px-3 py-2 text-sm focus:outline-2 focus:outline-blue-500"
            />
          </div>
          <div>
            <label
              htmlFor={`${id}-type`}
              className="mb-1 block text-sm font-medium"
            >
              Input type
            </label>
            <select
              id={`${id}-type`}
              value={type}
              disabled={mutation.isPending}
              onChange={(event) =>
                setType(event.target.value === "NUMBER" ? "NUMBER" : "TEXT")
              }
              className="rounded border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="TEXT">Text</option>
              <option value="NUMBER">Numbers only</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={mutation.isPending}
            className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {mutation.isPending ? "Creating…" : "Create column"}
          </button>
          <button
            type="button"
            disabled={mutation.isPending}
            onClick={() => {
              setOpen(false);
              setError(null);
            }}
            className="rounded px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
          >
            Cancel
          </button>
          {error && (
            <p role="alert" className="w-full text-sm text-red-700">
              {error}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
