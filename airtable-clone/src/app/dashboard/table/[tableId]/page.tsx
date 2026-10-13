"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import ColumnHeader from "~/app/_components/ColumnHeader";
import AddColumnForm from "~/app/_components/AddColumnForm";
import InfoTooltip from "~/app/_components/InfoTooltip";
import ResourceNameEditor from "~/app/_components/ResourceNameEditor";
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
import {
  replaceCachedCell,
  removeCachedColumn,
  type CellValue,
} from "~/utils/cell-cache";

const COLUMN_WIDTH = 240;
const ROW_CONTROL_WIDTH = 88;

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
  const { mutateAsync: deleteColumn } = api.column.deleteColumn.useMutation();
  const [reordering, setReordering] = useState(false);
  const { mutateAsync: moveColumnMutation } =
    api.column.moveColumn.useMutation();
  const [columnBusy, setColumnBusy] = useState(false);
  const [columnError, setColumnError] = useState<string | null>(null);
  const [columnDeleteTarget, setColumnDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [typeTarget, setTypeTarget] = useState<{
    id: string;
    name: string;
    type: "TEXT" | "NUMBER";
  } | null>(null);
  const preview = api.column.previewTypeChange.useQuery(
    { columnId: typeTarget?.id ?? "", type: typeTarget?.type ?? "TEXT" },
    { enabled: !!typeTarget, staleTime: 0, refetchOnWindowFocus: false },
  );
  const { mutateAsync: changeColumnType } = api.column.changeType.useMutation();
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

  async function confirmColumnDeletion() {
    if (
      !columnDeleteTarget ||
      rowOperation.current ||
      pendingCells.current.size
    )
      return;
    rowOperation.current = true;
    setColumnBusy(true);
    setColumnError(null);
    const columnId = columnDeleteTarget.id;
    try {
      await Promise.all([
        utils.table.getTableWithColumns.cancel({ tableId }),
        utils.row.getRows.cancel({ tableId, take: 200 }),
      ]);
      await deleteColumn({ columnId });
      utils.row.getRows.setInfiniteData({ tableId, take: 200 }, (data) =>
        removeCachedColumn(data, columnId),
      );
      utils.table.getTableWithColumns.setData({ tableId }, (table) =>
        table
          ? {
              ...table,
              columns: table.columns.filter((column) => column.id !== columnId),
            }
          : table,
      );
      setColumnDeleteTarget(null);
      setFocusTarget(null);
    } catch (cause) {
      setColumnError(
        cause instanceof Error ? cause.message : "Could not delete column",
      );
    } finally {
      rowOperation.current = false;
      setColumnBusy(false);
    }
  }

  async function confirmTypeChange() {
    if (
      !typeTarget ||
      !preview.data?.canConvert ||
      rowOperation.current ||
      pendingCells.current.size
    )
      return;
    rowOperation.current = true;
    setColumnBusy(true);
    setColumnError(null);
    let committed = false;
    try {
      await Promise.all([
        utils.table.getTableWithColumns.cancel({ tableId }),
        utils.row.getRows.cancel({ tableId, take: 200 }),
      ]);
      const column = await changeColumnType({
        columnId: typeTarget.id,
        fromType: preview.data.fromType,
        type: typeTarget.type,
      });
      committed = true;
      utils.table.getTableWithColumns.setData({ tableId }, (table) =>
        table
          ? {
              ...table,
              columns: table.columns.map((existing) =>
                existing.id === column.id
                  ? { ...existing, type: column.type }
                  : existing,
              ),
            }
          : table,
      );
      setTypeTarget(null);
      setFocusTarget(null);
      parentRef.current?.scrollTo({ top: 0 });
      await utils.row.getRows.reset({ tableId, take: 200 });
    } catch (cause) {
      setColumnError(
        committed
          ? "Type changed, but rows could not be refreshed. Reload the page."
          : cause instanceof Error
            ? cause.message
            : "Could not change column type",
      );
    } finally {
      rowOperation.current = false;
      setColumnBusy(false);
    }
  }

  async function reorderColumn(columnId: string, direction: "left" | "right") {
    if (rowOperation.current || pendingCells.current.size) return;
    rowOperation.current = true;
    setColumnBusy(true);
    setReordering(true);
    setColumnError(null);
    try {
      await utils.table.getTableWithColumns.cancel({ tableId });
      const columns = await moveColumnMutation({
        tableId,
        columnId,
        direction,
      });
      utils.table.getTableWithColumns.setData({ tableId }, (table) =>
        table ? { ...table, columns } : table,
      );
      setFocusTarget(null);
    } catch (cause) {
      setColumnError(
        cause instanceof Error ? cause.message : "Could not reorder column",
      );
    } finally {
      rowOperation.current = false;
      setColumnBusy(false);
      setReordering(false);
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
    const columnIndex =
      table?.columns.findIndex(
        (column) => column.id === focusTarget.columnId,
      ) ?? -1;
    if (columnIndex >= 0) {
      const left = ROW_CONTROL_WIDTH + columnIndex * COLUMN_WIDTH;
      const right = left + COLUMN_WIDTH;
      if (COLUMN_WIDTH > viewport.clientWidth - ROW_CONTROL_WIDTH)
        viewport.scrollLeft = left - ROW_CONTROL_WIDTH;
      else if (left < viewport.scrollLeft + ROW_CONTROL_WIDTH)
        viewport.scrollLeft = left - ROW_CONTROL_WIDTH;
      else if (right > viewport.scrollLeft + viewport.clientWidth)
        viewport.scrollLeft = Math.max(0, right - viewport.clientWidth);
    }
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
  }, [focusTarget, rowBusy, rows, table, virtualItems, rowVirtualizer]);

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
        <h1
          className="min-w-0 truncate text-xl font-semibold"
          title={table.name}
        >
          {table.name}
        </h1>
        <ResourceNameEditor resource="table" id={tableId} name={table.name} />
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
            pendingCount > 0 || rowBusy || columnBusy
              ? "h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-blue-100 border-t-blue-600 motion-reduce:animate-none"
              : saveError || rowError || columnError
                ? "h-2 w-2 shrink-0 rounded-full bg-red-500"
                : "h-2 w-2 shrink-0 rounded-full bg-green-500"
          }
        />
        <span>
          {pendingCount > 0
            ? `Saving ${pendingCount} cell${pendingCount === 1 ? "" : "s"}…`
            : columnBusy
              ? reordering
                ? "Reordering columns…"
                : typeTarget
                  ? "Changing column type…"
                  : "Deleting column…"
              : rowBusy
                ? "Updating rows…"
                : saveError || rowError || columnError
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
          disabled={rowBusy || columnBusy || pendingCount > 0}
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
      {typeTarget && (
        <section
          aria-labelledby="type-change-title"
          className="mb-3 rounded-lg border border-blue-200 bg-white p-4"
        >
          <h2 id="type-change-title" className="font-medium">
            Change “{typeTarget.name}” to{" "}
            {typeTarget.type === "TEXT" ? "Text" : "Numbers only"}?
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Values will be converted together. Invalid values block the change;
            nothing is discarded. Blank values stay empty. Numeric formatting
            such as leading zeros will be lost when converting to numbers.
            Numbers use floating-point precision.
          </p>
          {preview.isFetching ? (
            <LoadingSpinner label="Checking column values…" fullPage={false} />
          ) : preview.error ? (
            <p role="alert" className="mt-2 text-red-700">
              {preview.error.message}
            </p>
          ) : (
            preview.data && (
              <div className="my-3 text-sm">
                <p>
                  {preview.data.total} stored cells checked.{" "}
                  {preview.data.invalidCount} values cannot be converted.
                </p>
                {preview.data.samples.length > 0 && (
                  <ul className="mt-2 list-inside list-disc text-red-700">
                    {preview.data.samples.map((sample, index) => (
                      <li key={index}>Invalid value: “{sample.value}”</li>
                    ))}
                  </ul>
                )}
              </div>
            )
          )}
          <div className="mt-3 flex gap-3">
            <button
              type="button"
              disabled={
                columnBusy ||
                rowBusy ||
                pendingCount > 0 ||
                preview.isFetching ||
                !preview.data?.canConvert
              }
              onClick={() => void confirmTypeChange()}
              className="rounded bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-50"
            >
              {columnBusy ? "Converting…" : "Confirm change"}
            </button>
            <button
              type="button"
              disabled={columnBusy || preview.isFetching}
              onClick={() => void preview.refetch()}
              className="rounded border px-3 py-2 text-sm"
            >
              Refresh preview
            </button>
            <button
              type="button"
              disabled={columnBusy}
              onClick={() => {
                setTypeTarget(null);
                setColumnError(null);
              }}
              className="rounded border px-3 py-2 text-sm"
            >
              Cancel
            </button>
          </div>
          {columnError && (
            <p role="alert" className="mt-2 text-sm text-red-700">
              {columnError}
            </p>
          )}
        </section>
      )}
      {!typeTarget && !columnDeleteTarget && columnError && (
        <p role="alert" className="mb-2 text-sm text-red-700">
          {columnError}
        </p>
      )}
      {columnDeleteTarget && (
        <div
          role="alertdialog"
          aria-modal="false"
          aria-labelledby="delete-column-title"
          className="mb-3 rounded border border-red-200 bg-red-50 p-3"
        >
          <p id="delete-column-title">
            Delete column “{columnDeleteTarget.name}” and all its values? This
            cannot be undone.
          </p>
          <div className="mt-2 flex gap-3">
            <button
              type="button"
              disabled={columnBusy || rowBusy || pendingCount > 0}
              onClick={() => void confirmColumnDeletion()}
              className="rounded bg-red-700 px-3 py-1 text-white disabled:opacity-50"
            >
              {columnBusy ? "Deleting…" : "Delete column"}
            </button>
            <button
              type="button"
              disabled={columnBusy}
              onClick={() => {
                setColumnDeleteTarget(null);
                setColumnError(null);
              }}
              className="rounded border px-3 py-1"
            >
              Cancel
            </button>
          </div>
          {columnError && (
            <p role="alert" className="mt-2 text-sm text-red-700">
              {columnError}
            </p>
          )}
        </div>
      )}
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
              disabled={rowBusy || columnBusy || pendingCount > 0}
              onClick={() => void manageRow("delete", deleteTarget.id)}
              className="rounded bg-red-700 px-3 py-1 text-white disabled:opacity-50"
            >
              Delete row
            </button>
            <button
              type="button"
              disabled={rowBusy || columnBusy}
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
        <table
          className="table-fixed border-collapse border border-gray-300"
          style={{
            width: ROW_CONTROL_WIDTH + table.columns.length * COLUMN_WIDTH,
          }}
        >
          <thead className="sticky top-0 z-30 bg-white">
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-40 border border-gray-300 bg-slate-50 px-2 py-1 text-left"
                style={{ width: ROW_CONTROL_WIDTH }}
              >
                Row
              </th>
              {table.columns.map((col, columnIndex) => (
                <ColumnHeader
                  key={col.id}
                  columnId={col.id}
                  canMoveLeft={columnIndex > 0}
                  canMoveRight={columnIndex < table.columns.length - 1}
                  onMove={(direction) => void reorderColumn(col.id, direction)}
                  deleteDisabled={rowBusy || columnBusy || pendingCount > 0}
                  onChangeType={() => {
                    setTypeTarget({
                      id: col.id,
                      name: col.name,
                      type: col.type === "TEXT" ? "NUMBER" : "TEXT",
                    });
                    setColumnDeleteTarget(null);
                    setColumnError(null);
                  }}
                  onDelete={() => {
                    setTypeTarget(null);
                    setColumnDeleteTarget({ id: col.id, name: col.name });
                    setColumnError(null);
                  }}
                  tableId={tableId}
                  name={col.name}
                  type={col.type}
                  width={`${COLUMN_WIDTH}px`}
                />
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
                    className="sticky left-0 z-20 flex h-full shrink-0 items-center justify-between border border-gray-300 bg-gray-50 px-2 text-xs text-gray-600"
                    style={{ width: ROW_CONTROL_WIDTH }}
                  >
                    <span>{virtualRow.index + 1}</span>
                    <button
                      type="button"
                      aria-label={`Delete row ${virtualRow.index + 1}`}
                      title="Delete row"
                      disabled={rowBusy || columnBusy || pendingCount > 0}
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
                        width={`${COLUMN_WIDTH}px`}
                        disabled={rowBusy || columnBusy}
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
