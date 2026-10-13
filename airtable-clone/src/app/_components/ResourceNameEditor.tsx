"use client";

import { useId, useRef, useState } from "react";
import { api } from "~/trpc/react";

export default function ResourceNameEditor({
  resource,
  id,
  name,
}: {
  resource: "base" | "table";
  id: string;
  name: string;
}) {
  const inputId = useId();
  const utils = api.useUtils();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const baseMutation = api.base.renameBase.useMutation({
    onMutate: async () => {
      await Promise.all([
        utils.base.getUserBases.cancel(),
        utils.base.getBase.cancel({ baseId: id }),
      ]);
    },
    onSuccess: (base) => {
      utils.base.getUserBases.setData(undefined, (bases) =>
        bases?.map((existing) =>
          existing.id === base.id ? { ...existing, name: base.name } : existing,
        ),
      );
      utils.base.getBase.setData({ baseId: base.id }, (existing) =>
        existing ? { ...existing, name: base.name } : existing,
      );
    },
  });
  const tableMutation = api.table.renameTable.useMutation({
    onMutate: async () => {
      await Promise.all([
        utils.table.getTablesByBase.cancel(),
        utils.table.getTableWithColumns.cancel({ tableId: id }),
      ]);
    },
    onSuccess: (table) => {
      utils.table.getTablesByBase.setData({ baseId: table.baseId }, (tables) =>
        tables?.map((existing) =>
          existing.id === table.id
            ? { ...existing, name: table.name }
            : existing,
        ),
      );
      utils.table.getTableWithColumns.setData(
        { tableId: table.id },
        (existing) => (existing ? { ...existing, name: table.name } : existing),
      );
    },
  });
  const pending = baseMutation.isPending || tableMutation.isPending;
  const busy = useRef(false);
  function cancel() {
    if (pending) return;
    setEditing(false);
    setError(null);
    requestAnimationFrame(() => buttonRef.current?.focus());
  }
  if (!editing)
    return (
      <button
        ref={buttonRef}
        type="button"
        aria-label={`Rename ${resource} ${name}`}
        title={`Rename ${resource}`}
        onClick={() => {
          setDraft(name);
          setError(null);
          setEditing(true);
        }}
        className="shrink-0 rounded px-2 py-1 text-sm font-normal text-slate-500 hover:bg-blue-50 hover:text-blue-700"
      >
        ✎ Rename
      </button>
    );
  return (
    <form
      className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (busy.current) return;
        const value = draft.trim();
        if (!value) {
          setError("Enter a name");
          return;
        }
        if (value === name) {
          cancel();
          return;
        }
        busy.current = true;
        setError(null);
        const save =
          resource === "base"
            ? baseMutation.mutateAsync({ baseId: id, name: value })
            : tableMutation.mutateAsync({ tableId: id, name: value });
        void save
          .then(() => {
            setEditing(false);
            requestAnimationFrame(() => buttonRef.current?.focus());
          })
          .catch((cause: unknown) =>
            setError(
              cause instanceof Error ? cause.message : "Could not rename",
            ),
          )
          .finally(() => {
            busy.current = false;
          });
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          cancel();
        }
      }}
    >
      <label htmlFor={inputId} className="sr-only">
        {resource === "base" ? "Base" : "Table"} name
      </label>
      <input
        id={inputId}
        autoFocus
        required
        maxLength={100}
        disabled={pending}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          setError(null);
        }}
        className="min-w-0 rounded border border-blue-400 px-2 py-1 text-sm font-normal"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save"}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={cancel}
        className="rounded px-2 py-1 text-sm font-normal text-slate-600 hover:bg-slate-100"
      >
        Cancel
      </button>
      {error && (
        <p role="alert" className="w-full text-sm font-normal text-red-700">
          {error}
        </p>
      )}
    </form>
  );
}
