"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import AddColumnForm from "~/app/_components/AddColumnForm";
import InfoTooltip from "~/app/_components/InfoTooltip";
import LoadingSpinner from "~/app/_components/LoadingSpinner";
import { api } from "~/trpc/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  getCellDestination,
  type CellDirection,
} from "~/utils/cell-navigation";
import { EditableCell } from "~/app/_components/EditableCell";
import { prependCachedRow, removeCachedRow } from "~/utils/row-cache";
import { parseCellValue } from "~/utils/cell-value";
import { replaceCachedCell, type CellValue } from "~/utils/cell-cache";

export default function TablePage() {
  const params = useParams();
  const tableId = params.tableId as string;
  const [focusTarget, setFocusTarget] = useState<{
    rowId: string;
    columnId: string;
  } | null>(null);
  const navigationRequest = useRef(0);
  const parentRef = useRef<HTMLDivElement>(null);

  const utils = api.useUtils();
  const { mutateAsync } = api.cell.updateCell.useMutation();
  const { mutateAsync: createRow } = api.row.createRow.useMutation();
  const { mutateAsync: deleteRow } = api.row.deleteRow.useMutation();
  const rowOperation = useRef(false);
  const [rowBusy, setRowBusy] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    number: number;
  } | null>(null);
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
      if (rowOperation.current)
        throw new Error("Wait for the row operation to finish.");
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

  async function manageRow(action: "create" | "delete", rowId?: string) {
    if (rowOperation.current || pendingCells.current.size) return;
    rowOperation.current = true;
    setRowBusy(true);
    setRowError(null);
    const query = { tableId, take: 200 };
    try {
      await utils.row.getRows.cancel(query);
      if (action === "create") {
        const row = await createRow({ tableId });
        utils.row.getRows.setInfiniteData(query, (data) =>
          prependCachedRow(data, row),
        );
        parentRef.current?.scrollTo({ top: 0 });
      } else if (rowId) {
        await deleteRow({ rowId });
        utils.row.getRows.setInfiniteData(query, (data) =>
          removeCachedRow(data, rowId),
        );
        setDeleteTarget(null);
      }
    } catch (cause) {
      setRowError(
        cause instanceof Error ? cause.message : "Could not update rows",
      );
    } finally {
      rowOperation.current = false;
      setRowBusy(false);
    }
  }

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

  const virtualItems = rowVirtualizer.getVirtualItems();
  const navigateCell = useCallback(
    (rowId: string, columnId: string, direction: CellDirection) => {
      if (rowOperation.current || !table) return false;
      const destination = getCellDestination(
        rows.findIndex((row) => row.id === rowId),
        table.columns.findIndex((column) => column.id === columnId),
        direction,
        rows.length,
        table.columns.length,
        !!hasNextPage,
      );
      if (!destination) return false;
      const column = table.columns[destination.column];
      if (!column) return false;
      const request = ++navigationRequest.current;
      const row = rows[destination.row];
      if (row) setFocusTarget({ rowId: row.id, columnId: column.id });
      else {
        const source = document.activeElement;
        void fetchNextPage({ cancelRefetch: false })
          .then((result) => {
            if (
              request !== navigationRequest.current ||
              source !== document.activeElement
            )
              return;
            const nextRow = result.data?.pages.flatMap(
              (page) => page.formattedRows,
            )[destination.row];
            if (nextRow)
              setFocusTarget({ rowId: nextRow.id, columnId: column.id });
            else if (result.error)
              setRowError("Could not load the next row. Try again.");
          })
          .catch(() => setRowError("Could not load the next row. Try again."));
      }
      return true;
    },
    [rows, table, hasNextPage, fetchNextPage],
  );

  useEffect(() => {
    if (!focusTarget || rowBusy) return;
    const index = rows.findIndex((row) => row.id === focusTarget.rowId);
    if (index < 0) {
      setFocusTarget(null);
      return;
    }
    const viewport = parentRef.current;
    if (!viewport) return;
    const headerHeight = viewport.querySelector("thead")?.offsetHeight ?? 0;
    const rowTop = index * 36;
    const rowBottom = rowTop + 36;
    // Fixed-height rows let us scroll once, without scrollToIndex's retry loop.
    if (rowTop < viewport.scrollTop) rowVirtualizer.scrollToOffset(rowTop);
    else if (
      rowBottom >
      viewport.scrollTop + viewport.clientHeight - headerHeight
    )
      rowVirtualizer.scrollToOffset(
        rowBottom - viewport.clientHeight + headerHeight,
      );
    const cell = Array.from(
      parentRef.current?.querySelectorAll<HTMLTableCellElement>(
        "td[data-row-id]",
      ) ?? [],
    ).find(
      (element) =>
        element.dataset.rowId === focusTarget.rowId &&
        element.dataset.columnId === focusTarget.columnId,
    );
    if (cell) {
      cell.focus({ preventScroll: true });
      setFocusTarget(null);
    }
  }, [focusTarget, rowBusy, rows, virtualItems, rowVirtualizer]);

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
  if (tableLoading || rowsLoading)
    return <LoadingSpinner label="Loading your table…" />;
  if (!table) return <div>Table not found</div>;

  /* ---------------- RENDER ---------------- */
  return (
    <div>
      <Link
        href={`/dashboard/base/${table.baseId}`}
        className="mb-3 inline-flex items-center gap-2 rounded text-sm font-medium text-slate-600 hover:text-blue-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
      >
        <span aria-hidden="true">←</span>
        Back to base
      </Link>
      <div className="mb-2 flex items-center gap-2">
        <h1 className="text-xl font-semibold">{table.name}</h1>
        <InfoTooltip label="Table editing tips">
          <p>
            Click to select. Double-click or Enter to edit. Enter saves; Escape
            or clicking away cancels.
          </p>
          <p>
            Arrows move between cells. Tab/Shift+Tab move forward/back and save
            while editing.
          </p>
          <p>
            Ctrl/Cmd+C copies a selected cell. Ctrl/Cmd+V pastes and saves one
            value.
          </p>
        </InfoTooltip>
      </div>
      <p
        role="status"
        aria-live="polite"
        className="mb-2 flex min-h-5 items-center gap-2 text-sm text-gray-600"
      >
        <span
          aria-hidden="true"
          className={
            pendingCount > 0 || rowBusy
              ? "h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-blue-100 border-t-blue-600 motion-reduce:animate-none"
              : saveError || rowError
                ? "h-2 w-2 shrink-0 rounded-full bg-red-500"
                : "h-2 w-2 shrink-0 rounded-full bg-green-500"
          }
        />
        <span>
          {pendingCount > 0
            ? `Saving ${pendingCount} cell${pendingCount === 1 ? "" : "s"}…`
            : rowBusy
              ? "Updating rows…"
              : saveError || rowError
                ? "Some changes could not be saved"
                : "All changes saved"}
        </span>
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
      <div className="mb-3 flex items-center gap-3">
        <button
          type="button"
          disabled={rowBusy || pendingCount > 0}
          onClick={() => void manageRow("create")}
          className="rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50 disabled:opacity-50"
        >
          {rowBusy ? "Updating rows…" : "+ Add row"}
        </button>
        <InfoTooltip label="Row management tips">
          <p>
            New rows appear at the top. Use the trash icon beside a row number
            to delete it after confirmation.
          </p>
          <p>Finish pending cell saves before adding or deleting rows.</p>
        </InfoTooltip>
      </div>
      <div className="mb-3">
        <AddColumnForm tableId={tableId} />
      </div>
      {rowError && (
        <p role="alert" className="mb-2 text-sm text-red-700">
          {rowError}
        </p>
      )}
      {deleteTarget && (
        <div
          role="alertdialog"
          aria-modal="false"
          aria-labelledby="delete-row-title"
          className="mb-3 rounded border border-red-200 bg-red-50 p-3"
        >
          <p id="delete-row-title">
            Delete row {deleteTarget.number} and all its cell values? This
            cannot be undone.
          </p>
          <div className="mt-2 flex gap-3">
            <button
              type="button"
              disabled={rowBusy || pendingCount > 0}
              onClick={() => void manageRow("delete", deleteTarget.id)}
              className="rounded bg-red-700 px-3 py-1 text-white disabled:opacity-50"
            >
              Delete row
            </button>
            <button
              type="button"
              disabled={rowBusy}
              onClick={() => {
                setDeleteTarget(null);
                setRowError(null);
              }}
              className="rounded border px-3 py-1"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {!rows.length && (
        <p className="mb-2 text-sm text-gray-600">
          This table has no rows yet. Add a row to start entering data.
        </p>
      )}

      <div
        ref={parentRef}
        onPointerDown={() => {
          navigationRequest.current++;
          setFocusTarget(null);
        }}
        className="relative h-[80vh] overflow-auto border border-gray-300"
      >
        <table className="w-full table-fixed border-collapse border border-gray-300">
          <thead className="sticky top-0 z-10 bg-white">
            <tr>
              <th
                scope="col"
                className="border border-gray-300 px-2 py-1 text-left"
                style={{ width: 88 }}
              >
                Row
              </th>
              {table.columns.map((col) => (
                <th
                  key={col.id}
                  scope="col"
                  title={
                    col.type === "TEXT"
                      ? "Accepts text, numbers, and symbols"
                      : "Accepts numbers only"
                  }
                  className="border border-gray-300 px-2 py-1 text-left"
                  style={{
                    width: `calc((100% - 88px) / ${table.columns.length})`,
                  }}
                >
                  <span>{col.name}</span>
                  <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs font-normal text-gray-600">
                    {col.type === "TEXT" ? "Text" : "Numbers only"}
                  </span>
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
            {virtualItems.map((virtualRow) => {
              const row = rows[virtualRow.index];
              if (!row) return null;

              return (
                <tr
                  key={row.id}
                  className="group/row"
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
                  <td
                    className="flex h-full shrink-0 items-center justify-between border border-gray-300 bg-gray-50 px-2 text-xs text-gray-600"
                    style={{ width: 88 }}
                  >
                    <span>{virtualRow.index + 1}</span>
                    <button
                      type="button"
                      aria-label={`Delete row ${virtualRow.index + 1}`}
                      title="Delete row"
                      disabled={rowBusy || pendingCount > 0}
                      onClick={() => {
                        setDeleteTarget({
                          id: row.id,
                          number: virtualRow.index + 1,
                        });
                        setRowError(null);
                      }}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 focus-visible:text-red-600 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:opacity-40 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within/row:opacity-100 [@media(hover:hover)]:group-hover/row:opacity-100"
                    >
                      <svg
                        aria-hidden="true"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6" />
                      </svg>
                    </button>
                  </td>
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
                        width={`calc((100% - 88px) / ${table.columns.length})`}
                        disabled={rowBusy}
                        onSave={saveCell}
                        onNavigate={navigateCell}
                      />
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>

        {isFetchingNextPage && (
          <LoadingSpinner label="Loading more rows…" fullPage={false} />
        )}
      </div>
    </div>
  );
}
