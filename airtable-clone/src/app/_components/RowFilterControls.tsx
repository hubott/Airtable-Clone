"use client";

import { useState } from "react";
import type { RouterOutputs } from "~/trpc/react";
import {
  parseRowFilter,
  textFilterOperators,
  numberFilterOperators,
  type RowFilter,
} from "~/utils/row-filter";

export default function RowFilterControls({
  columns,
  filter,
  disabled,
  onChange,
}: {
  columns: RouterOutputs["table"]["getTableWithColumns"]["columns"];
  filter?: RowFilter;
  disabled: boolean;
  onChange: (filter?: RowFilter) => void;
}) {
  const [columnId, setColumnId] = useState(filter?.columnId ?? "");
  const [operator, setOperator] = useState<string>(
    filter?.operator ?? "contains",
  );
  const [value, setValue] = useState(
    filter && "value" in filter ? String(filter.value) : "",
  );
  const [error, setError] = useState<string | null>(null);
  const column = columns.find((entry) => entry.id === columnId);
  const operators =
    column?.type === "NUMBER" ? numberFilterOperators : textFilterOperators;
  const needsValue = operator !== "isEmpty" && operator !== "isNotEmpty";

  return (
    <form
      className="mb-3 rounded border border-slate-200 bg-slate-50 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!column || disabled) return;
        try {
          const next = parseRowFilter(column.id, column.type, operator, value);
          setError(null);
          onChange(next);
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : "Invalid filter");
        }
      }}
    >
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2">
          Filter by
          <select
            value={column?.id ?? ""}
            disabled={disabled}
            className="rounded border border-slate-300 bg-white px-2 py-1"
            onChange={(event) => {
              const next = columns.find(
                (entry) => entry.id === event.target.value,
              );
              setColumnId(event.target.value);
              setOperator(next?.type === "NUMBER" ? "equals" : "contains");
              setValue("");
              setError(null);
            }}
          >
            <option value="">Choose a column</option>
            {columns.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </label>
        {column && (
          <>
            <label className="flex items-center gap-2">
              Condition
              <select
                value={operator}
                disabled={disabled}
                className="rounded border border-slate-300 bg-white px-2 py-1"
                onChange={(event) => {
                  setOperator(event.target.value);
                  setError(null);
                }}
              >
                {operators.map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {needsValue && (
              <label className="flex items-center gap-2">
                Value
                <input
                  value={value}
                  disabled={disabled}
                  inputMode={column.type === "NUMBER" ? "decimal" : "text"}
                  aria-invalid={!!error}
                  aria-describedby={error ? "row-filter-error" : undefined}
                  onChange={(event) => {
                    setValue(event.target.value);
                    setError(null);
                  }}
                  className="w-48 rounded border border-slate-300 bg-white px-2 py-1"
                />
              </label>
            )}
          </>
        )}
        <button
          type="submit"
          disabled={disabled || !column}
          className="rounded bg-blue-600 px-3 py-1 text-white disabled:opacity-50"
        >
          Apply filter
        </button>
        {filter && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(undefined)}
            className="rounded border border-slate-300 bg-white px-3 py-1 disabled:opacity-50"
          >
            Clear filter
          </button>
        )}
      </div>
      <p className="mt-2 text-xs text-slate-500">
        {filter
          ? "Filter applied. Changes take effect when you choose Apply filter."
          : "No filter applied."}{" "}
        Text matching ignores case; empty includes missing cells.
      </p>
      {error && (
        <p
          id="row-filter-error"
          role="alert"
          className="mt-2 text-sm text-red-700"
        >
          {error}
        </p>
      )}
    </form>
  );
}
