"use client";

import { useState } from "react";
import { rowSearchSchema } from "~/utils/row-search";

export default function RowSearchControls({
  search,
  disabled,
  onChange,
}: {
  search?: string;
  disabled: boolean;
  onChange: (search?: string) => void;
}) {
  const [draft, setDraft] = useState(search ?? "");
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="mb-3 text-sm"
      role="search"
      aria-label="Search table rows"
      onSubmit={(event) => {
        event.preventDefault();
        if (disabled) return;
        const result = rowSearchSchema.safeParse(draft);
        if (!result.success) {
          setError(result.error.issues[0]?.message ?? "Invalid search");
          return;
        }
        setError(null);
        onChange(result.data);
      }}
    >
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2">
          Search table
          <input
            type="search"
            value={draft}
            disabled={disabled}
            placeholder="Text or a number"
            aria-invalid={!!error}
            aria-describedby={
              error ? "row-search-help row-search-error" : "row-search-help"
            }
            onChange={(event) => {
              setDraft(event.target.value);
              setError(null);
            }}
            className="w-64 rounded border border-slate-300 bg-white px-2 py-1"
          />
        </label>
        <button
          type="submit"
          disabled={disabled}
          className="rounded bg-blue-600 px-3 py-1 text-white disabled:opacity-50"
        >
          Search
        </button>
        {search && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(undefined)}
            className="rounded border border-slate-300 px-3 py-1 disabled:opacity-50"
          >
            Clear search
          </button>
        )}
      </div>
      <p id="row-search-help" className="mt-2 text-xs text-slate-500">
        Matches text in any column, ignoring case, or an exact numeric value.
        Search works with your filter and sort.
      </p>
      {search && (
        <p role="status" className="mt-1 text-xs text-slate-600">
          Searching for “{search}”.
        </p>
      )}
      {error && (
        <p
          id="row-search-error"
          role="alert"
          className="mt-2 text-sm text-red-700"
        >
          {error}
        </p>
      )}
    </form>
  );
}
