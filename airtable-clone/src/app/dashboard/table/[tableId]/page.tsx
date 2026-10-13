"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "~/trpc/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { EditableCell } from "~/app/_components/EditableCell";
import { parseCellValue } from "~/utils/cell-value";
import { replaceCachedCell, type CellValue } from "~/utils/cell-cache";

export default function TablePage() {
  const params = useParams();
  const tableId = params.tableId as string;
  const parentRef = useRef<HTMLDivElement>(null);

  const utils = api.useUtils();
  const { mutateAsync } = api.cell.updateCell.useMutation();
  const pendingCells = useRef(new Set<string>());
  const [pendingCount, setPendingCount] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);

  const saveCell = useCallback(
    async (
      rowId: string,
      columnId: string,
      type: "TEXT" | "NUMBER",
      value: string,
    ) => {
      const key = JSON.stringify([rowId, columnId]);
      if (pendingCells.current.has(key))
        throw new Error("This cell is still saving. Try again shortly.");
      const values = parseCellValue(type, value);
      pendingCells.current.add(key);
      setPendingCount(pendingCells.current.size);
      const query = { tableId, take: 200 };
      let previous: CellValue | undefined;
      let updated = false;
      try {
        await utils.row.getRows.cancel(query);
        previous = utils.row.getRows
          .getInfiniteData(query)
          ?.pages.flatMap((page) => page.formattedRows)
          .find((row) => row.id === rowId)?.cellsByColumnId[columnId];
        utils.row.getRows.setInfiniteData(query, (data) =>
          replaceCachedCell(data, rowId, columnId, {
            rowId,
            columnId,
            ...values,
          }),
        );
        updated = true;
        const saved = await mutateAsync({ rowId, columnId, value });
        utils.row.getRows.setInfiniteData(query, (data) =>
          replaceCachedCell(data, rowId, columnId, saved),
        );
      } catch (cause) {
        if (updated)
          utils.row.getRows.setInfiniteData(query, (data) =>
            replaceCachedCell(data, rowId, columnId, previous),
          );
        setSaveError(
          cause instanceof Error ? cause.message : "Could not save cell",
        );
        throw cause;
      } finally {
        pendingCells.current.delete(key);
        setPendingCount(pendingCells.current.size);
      }
    },
    [tableId, utils, mutateAsync],
  );

  /* ---------------- TABLE META ---------------- */
  const {
    data: table,
    error: tableError,
    isLoading: tableLoading,
  } = api.table.getTableWithColumns.useQuery(
    { tableId },
    { enabled: !!tableId },
  );

  /* ---------------- ROWS (INFINITE) ---------------- */
  const {
    data: rowPages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    error: rowsError,
    isLoading: rowsLoading,
  } = api.row.getRows.useInfiniteQuery(
    { tableId, take: 200 },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      enabled: !!tableId,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  );

  /* ---------------- FLATTEN ROWS ---------------- */
  const rows = useMemo(
    () => rowPages?.pages.flatMap((p) => p.formattedRows) ?? [],
    [rowPages],
  );

  /* ---------------- VIRTUALIZER ---------------- */
  // TanStack Virtual invalidates measurements when this callback changes.
  // Keep it stable across the virtualizer's own rerenders to avoid a render loop.
  const getItemKey = useCallback(
    (index: number) => rows[index]?.id ?? index,
    [rows],
  );

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 12,
    getItemKey,
    // React 19 cannot flush synchronous updates while recalculating during render.
    useFlushSync: false,
  });

  /* ---------------- INFINITE SCROLL ---------------- */
  useEffect(() => {
    const checkLoadMore = async () => {
      const virtualItems = rowVirtualizer.getVirtualItems();
      const lastItem = virtualItems.at(-1);
      if (!lastItem) return;

      if (
        lastItem.index >= rows.length - 5 &&
        hasNextPage &&
        !isFetchingNextPage
      ) {
        await fetchNextPage();
      }
    };

    // Check on mount and whenever rows change
    void checkLoadMore();

    const el = parentRef.current;
    if (!el) return;
    const onScroll = () => {
      void checkLoadMore();
    };
    el.addEventListener("scroll", onScroll);
    return () => el?.removeEventListener("scroll", onScroll);
  }, [
    rows.length,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    rowVirtualizer,
  ]);

  // Force virtualizer to recompute when rows update
  useEffect(() => {
    rowVirtualizer.measure();
  }, [rows.length, rowVirtualizer]);

  /* ---------------- LOADING STATES ---------------- */
  if (tableError || rowsError)
    return <div role="alert">{tableError?.message ?? rowsError?.message}</div>;
  if (tableLoading || rowsLoading) return <div>Loading…</div>;
  if (!table) return <div>Table not found</div>;

  /* ---------------- RENDER ---------------- */
  return (
    <div>
      <h1 className="mb-2 text-xl font-semibold">{table.name}</h1>
      <p className="mb-2 text-sm text-gray-600">
        Click to select. Double-click or press Enter to edit. Enter saves;
        Escape or leaving the cell cancels.
      </p>
      <p role="status" className="mb-2 min-h-5 text-sm text-gray-600">
        {pendingCount > 0
          ? `Saving ${pendingCount} cell${pendingCount === 1 ? "" : "s"}…`
          : saveError
            ? "Some changes could not be saved"
            : "All changes saved"}
      </p>
      {saveError && (
        <div role="alert" className="mb-2 flex gap-3 text-sm text-red-700">
          <span>
            Save failed: {saveError}. The previous value was restored. Edit the
            cell to retry.
          </span>
          <button
            type="button"
            className="underline"
            onClick={() => setSaveError(null)}
          >
            Dismiss
          </button>
        </div>
      )}
      {!rows.length && (
        <p className="mb-2 text-sm text-gray-600">
          This table has no rows yet.
        </p>
      )}

      <div
        ref={parentRef}
        className="relative h-[80vh] overflow-auto border border-gray-300"
      >
        <table className="w-full table-fixed border-collapse border border-gray-300">
          <thead className="sticky top-0 z-10 bg-white">
            <tr>
              {table.columns.map((col) => (
                <th
                  key={col.id}
                  className="border border-gray-300 px-2 py-1 text-left"
                  style={{ width: `${100 / table.columns.length}%` }}
                >
                  {col.name}
                </th>
              ))}
            </tr>
          </thead>

          <tbody
            style={{
              height: rowVirtualizer.getTotalSize(),
              position: "relative",
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const row = rows[virtualRow.index];
              if (!row) return null;

              return (
                <tr
                  key={row.id}
                  style={{
                    position: "absolute",
                    top: 0,
                    transform: `translateY(${virtualRow.start}px)`,
                    width: "100%",
                    display: "flex",
                    height: "36px",
                    alignItems: "center",
                  }}
                >
                  {table.columns.map((col) => {
                    const cell = row.cellsByColumnId?.[col.id];

                    return (
                      <EditableCell
                        key={col.id}
                        rowId={row.id}
                        columnId={col.id}
                        columnName={col.name}
                        type={col.type}
                        value={
                          col.type === "TEXT"
                            ? (cell?.textValue ?? null)
                            : (cell?.numberValue ?? null)
                        }
                        width={100 / table.columns.length}
                        onSave={saveCell}
                      />
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>

        {isFetchingNextPage && (
          <div className="py-2 text-center text-sm text-gray-500">
            Loading more…
          </div>
        )}
      </div>
    </div>
  );
}
