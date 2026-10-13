"use client";

import { useQueryClient } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "~/trpc/react";

export default function DeleteResourceButton({
  resource,
  id,
  name,
  disabled = false,
  onPendingChange,
}: {
  resource: "base" | "table";
  id: string;
  name: string;
  disabled?: boolean;
  onPendingChange?: (pending: boolean) => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const utils = api.useUtils();
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const baseMutation = api.base.deleteBase.useMutation();
  const tableMutation = api.table.deleteTable.useMutation();
  async function remove() {
    if (busy.current || disabled) return;
    const details =
      resource === "base"
        ? "all its tables, columns, rows and cell values"
        : "all its columns, rows and cell values";
    if (
      !window.confirm(
        `Delete ${resource} “${name}” and ${details}? This cannot be undone.`,
      )
    )
      return;
    busy.current = true;
    setPending(true);
    onPendingChange?.(true);
    setError(null);
    try {
      await Promise.all([
        utils.base.getUserBases.cancel(),
        utils.base.getBase.cancel(),
        utils.table.getTablesByBase.cancel(),
        utils.table.getTableWithColumns.cancel(),
        utils.row.getRows.cancel(),
      ]);
      if (resource === "base") {
        const result = await baseMutation.mutateAsync({ baseId: id });
        utils.base.getUserBases.setData(undefined, (bases) =>
          bases?.filter((base) => base.id !== id),
        );
        queryClient.removeQueries({
          queryKey: getQueryKey(api.base.getBase, { baseId: id }, "query"),
          exact: true,
        });
        utils.table.getTablesByBase.setData({ baseId: id }, () => []);
        for (const tableId of result.tableIds) {
          queryClient.removeQueries({
            queryKey: getQueryKey(
              api.table.getTableWithColumns,
              { tableId },
              "query",
            ),
            exact: true,
          });
          queryClient.removeQueries({
            queryKey: getQueryKey(api.row.getRows, { tableId }, "infinite"),
          });
        }
        router.replace("/dashboard");
      } else {
        const table = await tableMutation.mutateAsync({ tableId: id });
        utils.table.getTablesByBase.setData(
          { baseId: table.baseId },
          (tables) => tables?.filter((existing) => existing.id !== id),
        );
        queryClient.removeQueries({
          queryKey: getQueryKey(
            api.table.getTableWithColumns,
            { tableId: id },
            "query",
          ),
          exact: true,
        });
        queryClient.removeQueries({
          queryKey: getQueryKey(api.row.getRows, { tableId: id }, "infinite"),
        });
        router.replace(`/dashboard/base/${table.baseId}`);
      }
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : `Could not delete ${resource}`,
      );
    } finally {
      busy.current = false;
      setPending(false);
      onPendingChange?.(false);
    }
  }
  return (
    <div className="shrink-0">
      <button
        type="button"
        disabled={disabled || pending}
        aria-label={`Delete ${resource} ${name}`}
        onClick={() => void remove()}
        className="rounded px-2 py-1 text-sm text-slate-500 hover:bg-red-50 hover:text-red-700 disabled:opacity-40"
      >
        {pending ? "Deleting…" : "Delete"}
      </button>
      {error && (
        <p role="alert" className="mt-1 max-w-xs text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
