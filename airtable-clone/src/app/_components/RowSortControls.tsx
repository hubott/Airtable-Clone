"use client";

import type { RouterInputs, RouterOutputs } from "~/trpc/react";

type Sort = RouterInputs["row"]["getRows"]["sort"];

export default function RowSortControls({
  columns,
  sort,
  disabled,
  onChange,
}: {
  columns: RouterOutputs["table"]["getTableWithColumns"]["columns"];
  sort: Sort;
  disabled: boolean;
  onChange: (sort: Sort) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Sort table rows"
      className="mb-3 flex min-w-0 flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm"
    >
      <label className="flex w-full min-w-0 flex-col items-start gap-1.5 sm:w-auto sm:flex-row sm:items-center sm:gap-2">
        Sort by
        <select
          value={sort?.columnId ?? ""}
          disabled={disabled}
          onChange={(event) =>
            onChange(
              event.target.value
                ? {
                    columnId: event.target.value,
                    direction: sort?.direction ?? "asc",
                  }
                : undefined,
            )
          }
          className="w-full min-w-0 rounded border border-slate-300 bg-white px-3 py-2 sm:w-auto sm:max-w-64"
        >
          <option value="">Default order</option>
          {columns.map((column) => (
            <option key={column.id} value={column.id}>
              {column.name}
            </option>
          ))}
        </select>
      </label>
      {sort && (
        <label className="flex w-full min-w-0 flex-col items-start gap-1.5 sm:w-auto sm:flex-row sm:items-center sm:gap-2">
          Direction
          <select
            value={sort.direction}
            disabled={disabled}
            onChange={(event) =>
              onChange({
                ...sort,
                direction: event.target.value === "desc" ? "desc" : "asc",
              })
            }
            className="w-full min-w-0 rounded border border-slate-300 bg-white px-3 py-2 sm:w-auto sm:max-w-64"
          >
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
        </label>
      )}
      <span className="text-slate-500">
        {sort
          ? "Blanks last. Equal values keep their default order."
          : "New rows appear at the top."}
      </span>
    </div>
  );
}
