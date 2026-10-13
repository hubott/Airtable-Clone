"use client";

import { memo, useRef, useState } from "react";
import { readSingleCellClipboard } from "~/utils/cell-clipboard";
import type { CellDirection } from "~/utils/cell-navigation";
import { parseCellValue } from "~/utils/cell-value";

type Props = {
  rowId: string;
  columnId: string;
  columnName: string;
  type: "TEXT" | "NUMBER";
  value: string | number | null;
  width: number | string;
  disabled?: boolean;
  onNavigate?: (
    rowId: string,
    columnId: string,
    direction: CellDirection,
  ) => boolean;
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
  disabled = false,
  onNavigate,
}: Props) {
  const cellRef = useRef<HTMLTableCellElement>(null);
  const savingRef = useRef(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function startEditing() {
    if (savingRef.current || disabled) return;
    setDraft(String(value ?? ""));
    setError(null);
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
    setError(null);
    cellRef.current?.focus();
  }

  async function save(direction?: CellDirection, nextValue = draft) {
    if (savingRef.current || disabled) return;
    try {
      parseCellValue(type, nextValue);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Invalid value");
      return;
    }
    if (nextValue === String(value ?? "")) {
      cancel();
      if (direction) onNavigate?.(rowId, columnId, direction);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setEditing(false);
    cellRef.current?.focus();
    try {
      await onSave(rowId, columnId, type, nextValue);
      setError(null);
      if (direction && document.activeElement === cellRef.current)
        onNavigate?.(rowId, columnId, direction);
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
      data-row-id={rowId}
      data-column-id={columnId}
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      aria-label={`${columnName}: ${value ?? "empty"}`}
      aria-busy={saving}
      title={
        error ?? (saving ? "Saving…" : "Double-click or press Enter to edit")
      }
      className={`relative h-full min-w-0 border border-gray-300 px-2 py-1 focus-within:z-10 focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-blue-500 ${error ? "bg-red-50" : saving ? "bg-blue-50" : "bg-white"}`}
      style={{
        width: typeof width === "number" ? `${width}%` : width,
        minHeight: 36,
      }}
      onClick={() => {
        if (!editing) cellRef.current?.focus();
      }}
      onDoubleClick={startEditing}
      onCopy={(event) => {
        if (editing || document.activeElement !== cellRef.current) return;
        event.preventDefault();
        event.clipboardData.setData("text/plain", String(value ?? ""));
      }}
      onPaste={(event) => {
        if (editing || document.activeElement !== cellRef.current) return;
        event.preventDefault();
        if (disabled || savingRef.current) {
          setError(
            "Wait for the current save or row operation to finish before pasting.",
          );
          return;
        }
        if (!event.clipboardData.types.includes("text/plain")) {
          setError("Paste a text or numeric value.");
          return;
        }
        try {
          const pastedValue = readSingleCellClipboard(
            event.clipboardData.getData("text/plain"),
          );
          setError(null);
          void save(undefined, pastedValue);
        } catch (cause) {
          setError(
            cause instanceof Error ? cause.message : "Could not paste value",
          );
        }
      }}
      onKeyDown={(event) => {
        if (
          disabled ||
          editing ||
          event.ctrlKey ||
          event.metaKey ||
          event.altKey
        )
          return;
        const directions: Record<string, CellDirection> = {
          ArrowUp: "up",
          ArrowDown: "down",
          ArrowLeft: "left",
          ArrowRight: "right",
          Tab: event.shiftKey ? "previous" : "next",
        };
        const direction = directions[event.key];
        if (direction) {
          const handled = onNavigate?.(rowId, columnId, direction);
          if (handled || event.key !== "Tab") event.preventDefault();
          return;
        }
        if (!editing && event.key === "Enter") {
          event.preventDefault();
          startEditing();
        }
      }}
    >
      {editing ? (
        <input
          ref={focusInput}
          disabled={disabled}
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
            if (
              event.key === "Tab" &&
              !event.ctrlKey &&
              !event.metaKey &&
              !event.altKey
            ) {
              event.preventDefault();
              void save(event.shiftKey ? "previous" : "next");
            }
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
      {error && (
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
