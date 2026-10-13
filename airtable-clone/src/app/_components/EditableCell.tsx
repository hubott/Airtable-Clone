"use client";

import { memo, useRef, useState } from "react";
import { parseCellValue } from "~/utils/cell-value";

type Props = {
  rowId: string;
  columnId: string;
  columnName: string;
  type: "TEXT" | "NUMBER";
  value: string | number | null;
  width: number;
  onSave: (
    rowId: string,
    columnId: string,
    type: "TEXT" | "NUMBER",
    value: string,
  ) => Promise<void>;
};

function focusInput(input: HTMLInputElement | null) {
  input?.focus();
  input?.select();
}

export const EditableCell = memo(function EditableCell({
  rowId,
  columnId,
  columnName,
  type,
  value,
  width,
  onSave,
}: Props) {
  const cellRef = useRef<HTMLTableCellElement>(null);
  const savingRef = useRef(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function startEditing() {
    if (savingRef.current) return;
    setDraft(String(value ?? ""));
    setError(null);
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
    setError(null);
    cellRef.current?.focus();
  }

  async function save() {
    if (savingRef.current) return;
    try {
      parseCellValue(type, draft);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Invalid value");
      return;
    }
    if (draft === String(value ?? "")) {
      cancel();
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setEditing(false);
    cellRef.current?.focus();
    try {
      await onSave(rowId, columnId, type, draft);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save cell");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <td
      ref={cellRef}
      tabIndex={0}
      aria-label={`${columnName}: ${value ?? "empty"}`}
      aria-busy={saving}
      title={
        error ?? (saving ? "Saving…" : "Double-click or press Enter to edit")
      }
      className={`relative h-full min-w-0 border border-gray-300 px-2 py-1 focus-within:z-10 focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-blue-500 ${error ? "bg-red-50" : saving ? "bg-blue-50" : "bg-white"}`}
      style={{ width: `${width}%`, minHeight: 36 }}
      onClick={() => {
        if (!editing) cellRef.current?.focus();
      }}
      onDoubleClick={startEditing}
      onKeyDown={(event) => {
        if (!editing && event.key === "Enter") {
          event.preventDefault();
          startEditing();
        }
      }}
    >
      {editing ? (
        <input
          ref={focusInput}
          aria-label={`Edit ${columnName}`}
          aria-invalid={!!error}
          title={error ?? undefined}
          inputMode={type === "NUMBER" ? "decimal" : "text"}
          className="h-full w-full min-w-0 outline-none"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setError(null);
          }}
          onBlur={() => {
            setEditing(false);
            setError(null);
          }}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Enter") {
              event.preventDefault();
              void save();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              cancel();
            }
          }}
        />
      ) : (
        <div className="truncate">{value ?? ""}</div>
      )}
      {editing && error && (
        <span
          role="alert"
          className="absolute top-full left-0 z-30 rounded bg-red-700 px-2 py-1 text-xs text-white"
        >
          {error}
        </span>
      )}
    </td>
  );
});
