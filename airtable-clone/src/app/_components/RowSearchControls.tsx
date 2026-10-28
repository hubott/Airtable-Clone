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
      className="mb-3 min-w-0 rounded-xl border border-slate-200 bg-white p-4 text-sm"
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
        <label className="flex w-full min-w-0 flex-col items-start gap-1.5 sm:w-auto sm:flex-row sm:items-center sm:gap-2">
          Search table
          <input
            type="search"
            maxLength={200}
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
            className="w-full min-w-0 rounded border border-slate-300 bg-white px-3 py-2 sm:w-64"
          />
        </label>
        <button
          type="submit"
          disabled={disabled}
          className="rounded bg-blue-600 px-3 py-2 text-white disabled:opacity-50"
        >
          Search
        </button>
        {search && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(undefined)}
            className="rounded border border-slate-300 px-3 py-2 disabled:opacity-50"
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
        <p role="status" className="mt-1 text-xs break-words text-slate-600">
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
