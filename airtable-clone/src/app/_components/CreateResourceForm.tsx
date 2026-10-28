"use client";

import { useId, useRef, useState } from "react";

export default function CreateResourceForm({
  resource,
  onCreate,
}: {
  resource: "base" | "table";
  onCreate: (name: string) => Promise<void>;
}) {
  const id = useId();
  const busy = useRef(false);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="mb-6">
      <button
        type="button"
        disabled={pending}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          setOpen(!open);
          setError(null);
        }}
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        + New {resource}
      </button>
      {open && (
        <form
          id={id}
          className="mt-3 flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (busy.current) return;
            const value = name.trim();
            if (!value) {
              setError("Enter a name");
              return;
            }
            busy.current = true;
            setPending(true);
            setError(null);
            void onCreate(value)
              .then(() => {
                setOpen(false);
                setName("");
              })
              .catch((cause: unknown) =>
                setError(
                  cause instanceof Error
                    ? cause.message
                    : `Could not create ${resource}`,
                ),
              )
              .finally(() => {
                busy.current = false;
                setPending(false);
              });
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape" && !pending) {
              event.preventDefault();
              setOpen(false);
              setError(null);
            }
          }}
        >
          <div className="w-full min-w-0 sm:w-auto">
            <label
              htmlFor={`${id}-name`}
              className="mb-1 block text-sm font-medium"
            >
              {resource === "base" ? "Base" : "Table"} name
            </label>
            <input
              id={`${id}-name`}
              autoFocus
              required
              maxLength={100}
              disabled={pending}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setError(null);
              }}
              placeholder={
                resource === "base" ? "e.g. Project workspace" : "e.g. Tasks"
              }
              className="w-full min-w-0 rounded border border-slate-300 px-3 py-2 text-sm focus:outline-2 focus:outline-blue-500"
            />
          </div>
          <button
            type="submit"
            disabled={pending}
            className="rounded bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {pending ? "Creating…" : `Create ${resource}`}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setOpen(false);
              setError(null);
            }}
            className="rounded border px-3 py-2 text-sm"
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
