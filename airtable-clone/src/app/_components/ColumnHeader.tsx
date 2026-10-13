"use client";

import { useRef, useState } from "react";
import { api } from "~/trpc/react";

function focusInput(input: HTMLInputElement | null) {
  input?.focus();
  input?.select();
}

export default function ColumnHeader({
  columnId,
  tableId,
  name,
  type,
  width,
  onDelete,
  onChangeType,
  deleteDisabled = false,
}: {
  columnId: string;
  tableId: string;
  name: string;
  type: "TEXT" | "NUMBER";
  width: string;
  onDelete: () => void;
  onChangeType: () => void;
  deleteDisabled?: boolean;
}) {
  const utils = api.useUtils();
  const returnFocus = useRef(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const mutation = api.column.renameColumn.useMutation({
    onMutate: async () => {
      await utils.table.getTableWithColumns.cancel({ tableId });
    },
    onSuccess: (column) => {
      utils.table.getTableWithColumns.setData({ tableId }, (table) =>
        table
          ? {
              ...table,
              columns: table.columns.map((existing) =>
                existing.id === column.id ? column : existing,
              ),
            }
          : table,
      );
      setEditing(false);
      setError(null);
    },
    onError: (cause) => setError(cause.message),
  });
  const cancel = () => {
    if (!mutation.isPending) {
      returnFocus.current = true;
      setEditing(false);
      setError(null);
    }
  };
  return (
    <th
      scope="col"
      className="border border-gray-300 px-2 py-1 text-left"
      style={{ width }}
    >
      {editing ? (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (mutation.isPending) return;
            const value = draft.trim();
            if (!value) {
              setError("Enter a column name");
              return;
            }
            if (value === name) {
              cancel();
              return;
            }
            setError(null);
            mutation.mutate({ columnId, name: value });
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              cancel();
            }
          }}
        >
          <input
            ref={focusInput}
            aria-label={`Rename ${name}`}
            required
            maxLength={100}
            disabled={mutation.isPending}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              setError(null);
            }}
            className="min-w-0 flex-1 rounded border border-blue-400 px-2 py-1 text-sm font-normal focus:outline-2 focus:outline-blue-500"
          />
          <button
            type="submit"
            disabled={mutation.isPending}
            className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {mutation.isPending ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            disabled={mutation.isPending}
            onClick={cancel}
            className="rounded px-2 py-1 text-xs font-normal text-slate-600 hover:bg-slate-100"
          >
            Cancel
          </button>
          {error && (
            <span
              role="alert"
              className="w-full text-xs font-normal text-red-700"
            >
              {error}
            </span>
          )}
        </form>
      ) : (
        <button
          type="button"
          ref={(button) => {
            if (button && returnFocus.current) {
              button.focus();
              returnFocus.current = false;
            }
          }}
          aria-label={`Rename column ${name}`}
          title="Click to rename column"
          onClick={() => {
            setDraft(name);
            setError(null);
            setEditing(true);
          }}
          className="rounded px-1 text-left hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-2 focus-visible:outline-blue-500"
        >
          {name}
          <span aria-hidden="true" className="ml-2 text-xs text-slate-400">
            ✎
          </span>
        </button>
      )}
      <button
        type="button"
        aria-label={`Change type of column ${name}`}
        disabled={deleteDisabled || mutation.isPending}
        onClick={onChangeType}
        title={
          type === "TEXT"
            ? "Accepts text, numbers, and symbols"
            : "Accepts numbers only"
        }
        className="ml-2 inline-block rounded bg-gray-100 px-1.5 py-0.5 text-xs font-normal text-gray-600"
      >
        {type === "TEXT" ? "Text" : "Numbers only"}
      </button>
      {!editing && (
        <button
          type="button"
          aria-label={`Delete column ${name}`}
          title="Delete column"
          disabled={deleteDisabled || mutation.isPending}
          onClick={onDelete}
          className="ml-2 inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
        >
          <svg
            aria-hidden="true"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6" />
          </svg>
        </button>
      )}
    </th>
  );
}
