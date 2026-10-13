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
    <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
      <label className="flex items-center gap-2">
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
          className="rounded border border-slate-300 bg-white px-2 py-1"
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
        <label className="flex items-center gap-2">
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
            className="rounded border border-slate-300 bg-white px-2 py-1"
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
