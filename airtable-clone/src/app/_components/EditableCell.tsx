"use client";

import { memo, useRef, useState } from "react";
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
  selected?: boolean;
  onSelect?: (
    rowId: string,
    columnId: string,
    extend: boolean,
    focusOnly?: boolean,
  ) => void;
  onNavigate?: (
    rowId: string,
    columnId: string,
    direction: CellDirection,
    extend?: boolean,
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
  onSelect,
  selected = false,
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
      className={`relative h-full min-w-0 shrink-0 border border-gray-300 px-2 py-1 focus-within:z-10 focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-blue-500 ${error ? "bg-red-50" : saving || selected ? "bg-blue-50" : "bg-white"}`}
      style={{
        width: typeof width === "number" ? `${width}%` : width,
        minHeight: 36,
      }}
      data-selected={selected || undefined}
      onPointerDown={(event) => {
        if (!editing && !disabled && event.button === 0) {
          // Use grid selection rather than the browser's selection of cell text.
          event.preventDefault();
          window.getSelection()?.removeAllRanges();
          onSelect?.(rowId, columnId, event.shiftKey);
          cellRef.current?.focus();
        }
      }}
      onFocus={(event) => {
        if (event.target === event.currentTarget && !disabled)
          onSelect?.(rowId, columnId, false, true);
      }}
      onClick={() => {
        if (!editing) cellRef.current?.focus();
      }}
      onDoubleClick={startEditing}
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
          const handled = onNavigate?.(
            rowId,
            columnId,
            direction,
            event.shiftKey && event.key !== "Tab",
          );
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
