"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  rangeBounds,
  readCellRange,
  writeCellRange,
  type CellRange,
} from "~/utils/cell-range";
import ColumnHeader from "~/app/_components/ColumnHeader";
import AddColumnForm from "~/app/_components/AddColumnForm";
import InfoTooltip from "~/app/_components/InfoTooltip";
import DeleteResourceButton from "~/app/_components/DeleteResourceButton";
import ResourceNameEditor from "~/app/_components/ResourceNameEditor";
import LoadingSpinner from "~/app/_components/LoadingSpinner";
import RowSearchControls from "~/app/_components/RowSearchControls";
import RowFilterControls from "~/app/_components/RowFilterControls";
import { rowFilterKey } from "~/utils/row-filter";
import RowSortControls from "~/app/_components/RowSortControls";
import { useQueryClient } from "@tanstack/react-query";
import { resetRowView } from "~/utils/row-query-cache";
import { api, type RouterInputs } from "~/trpc/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  getCellDestination,
  type CellDirection,
} from "~/utils/cell-navigation";
import { EditableCell } from "~/app/_components/EditableCell";
import { prependCachedRows, removeCachedRow } from "~/utils/row-cache";
import { parseCellValue } from "~/utils/cell-value";
import {
  replaceCachedCell,
  replaceCachedCells,
  captureCachedCells,
  applyCachedCellChanges,
  type CachedCellChange,
  removeCachedColumn,
  type CellValue,
} from "~/utils/cell-cache";

type RowView = Pick<
  RouterInputs["row"]["getRows"],
  "sort" | "filter" | "search"
>;
const EMPTY_VIEW: RowView = {};
const COLUMN_WIDTH = 240;
const ROW_CONTROL_WIDTH = 88;

function clipboardCell(target: EventTarget | null) {
  if (
    !(target instanceof Element) ||
    target.closest('input, textarea, [contenteditable="true"]')
  )
    return null;
  return target.closest<HTMLTableCellElement>(
    "td[data-row-id][data-column-id]",
  );
}

export default function TablePage() {
  const [columnSizing, setColumnSizing] = useState<{
    tableId: string;
    widths: Record<string, number>;
  }>();
  const [selection, setSelection] = useState<CellRange | null>(null);
  const { mutateAsync: updateCells } = api.cell.updateCells.useMutation();
  const [tableDeleting, setTableDeleting] = useState(false);
  const params = useParams();
  const tableId = params.tableId as string;
  const widthStorageKey = `airtable-clone:column-widths:${tableId}`;

  useEffect(() => {
    setSelection(null);
    const widths: Record<string, number> = {};
    try {
      const stored: unknown = JSON.parse(
        localStorage.getItem(widthStorageKey) ?? "{}",
      );
      if (stored && typeof stored === "object" && !Array.isArray(stored)) {
        for (const [id, width] of Object.entries(stored)) {
          if (
            typeof width === "number" &&
            Number.isFinite(width) &&
            width >= 160 &&
            width <= 640
          ) {
            Object.defineProperty(widths, id, {
              value: width,
              enumerable: true,
              configurable: true,
              writable: true,
            });
          }
        }
      }
    } catch {
      // Missing or unavailable browser storage should not prevent resizing.
    }
    setColumnSizing({ tableId, widths });
  }, [tableId, widthStorageKey]);

  useEffect(() => {
    // Do not overwrite saved widths before this table has been restored.
    if (columnSizing?.tableId !== tableId) return;
    try {
      localStorage.setItem(
        widthStorageKey,
        JSON.stringify(columnSizing.widths),
      );
    } catch {
      // Resizing still works when storage is blocked or full.
    }
  }, [columnSizing, tableId, widthStorageKey]);

  const getColumnWidth = useCallback(
    (columnId: string) =>
      (columnSizing?.tableId === tableId
        ? columnSizing.widths[columnId]
        : undefined) ?? COLUMN_WIDTH,
    [columnSizing, tableId],
  );
  const resizeColumn = (columnId: string, width: number) => {
    setColumnSizing((current) => ({
      tableId,
      widths: {
        ...(current?.tableId === tableId ? current.widths : {}),
        [columnId]: width,
      },
    }));
  };
  const [viewSelection, setViewSelection] = useState<{
    tableId: string;
    view: RowView;
  }>();
  const view =
    viewSelection?.tableId === tableId ? viewSelection.view : EMPTY_VIEW;
  const { sort, filter, search } = view;
  const rowQuery = useMemo(
    () => ({ tableId, take: 200, ...view }),
    [tableId, view],
  );
  const viewRefreshNeeded = useRef(false);
  const [focusTarget, setFocusTarget] = useState<{
    rowId: string;
    columnId: string;
  } | null>(null);
  const navigationRequest = useRef(0);
  const parentRef = useRef<HTMLDivElement>(null);

  const utils = api.useUtils();
  const queryClient = useQueryClient();
  const resetRows = useCallback(
    (input: RouterInputs["row"]["getRows"]) => resetRowView(queryClient, input),
    [queryClient],
  );
  const { mutateAsync } = api.cell.updateCell.useMutation();
  const { mutateAsync: createRows } = api.row.createRows.useMutation();
  const [rowCount, setRowCount] = useState("1");
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
  const [pasting, setPasting] = useState(false);
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
      const query = rowQuery;
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
        // Defer reordering until every optimistic save has settled.
        if (
          search ||
          sort?.columnId === columnId ||
          filter?.columnId === columnId
        )
          viewRefreshNeeded.current = true;
        await utils.row.getRows.invalidate(
          { tableId: rowQuery.tableId },
          { refetchType: "none" },
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
        if (!pendingCells.current.size && viewRefreshNeeded.current) {
          viewRefreshNeeded.current = false;
          rowOperation.current = true;
          setRowBusy(true);
          navigationRequest.current++;
          setFocusTarget(null);
          parentRef.current?.scrollTo({ top: 0 });
          try {
            await resetRows(query);
          } catch {
            setRowError(
              "Cell saved, but rows could not be refreshed. Reload the page.",
            );
          } finally {
            rowOperation.current = false;
            setRowBusy(false);
          }
        }
      }
    },
    [rowQuery, sort, filter, search, utils, mutateAsync, resetRows],
  );

  async function changeView(nextView: RowView) {
    if (rowOperation.current || pendingCells.current.size) return;
    rowOperation.current = true;
    setRowBusy(true);
    navigationRequest.current++;
    setFocusTarget(null);
    setDeleteTarget(null);
    setSelection(null);
    setRowError(null);
    parentRef.current?.scrollTo({ top: 0 });
    try {
      await utils.row.getRows.cancel(rowQuery);
      await resetRows({
        tableId,
        take: 200,
        ...nextView,
      });
      setViewSelection({ tableId, view: nextView });
    } catch (cause) {
      setRowError(
        cause instanceof Error ? cause.message : "Could not change the view",
      );
    } finally {
      rowOperation.current = false;
      setRowBusy(false);
    }
  }

  async function manageRow(action: "create" | "delete", rowId?: string) {
    if (rowOperation.current || pendingCells.current.size) return;
    const count = Number(rowCount);
    if (
      action === "create" &&
      (!Number.isInteger(count) || count < 1 || count > 1000)
    ) {
      setRowError("Enter a whole number of rows from 1 to 1,000.");
      return;
    }
    rowOperation.current = true;
    setRowBusy(true);
    setRowError(null);
    const query = rowQuery;
    let committed = false;
    try {
      await utils.row.getRows.cancel(query);
      if (action === "create") {
        const createdRows = await createRows({ tableId, count });
        committed = true;
        if (sort || filter || search) await resetRows(query);
        else
          utils.row.getRows.setInfiniteData(query, (data) =>
            prependCachedRows(data, createdRows),
          );
        parentRef.current?.scrollTo({ top: 0 });
      } else if (rowId) {
        await deleteRow({ rowId });
        utils.row.getRows.setInfiniteData(query, (data) =>
          removeCachedRow(data, rowId),
        );
        setDeleteTarget(null);
      }
      await utils.row.getRows.invalidate({ tableId }, { refetchType: "none" });
    } catch (cause) {
      setRowError(
        committed
          ? "Rows added, but the view could not be refreshed. Retry loading rows or reload the page."
          : cause instanceof Error
            ? cause.message
            : "Could not update rows",
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
        utils.row.getRows.cancel(rowQuery),
      ]);
      await deleteColumn({ columnId });
      utils.row.getRows.setInfiniteData(rowQuery, (data) =>
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
      if (
        search ||
        sort?.columnId === columnId ||
        filter?.columnId === columnId
      ) {
        const nextView = {
          ...(search ? { search } : {}),
          ...(sort && sort.columnId !== columnId ? { sort } : {}),
          ...(filter && filter.columnId !== columnId ? { filter } : {}),
        };
        setViewSelection({ tableId, view: nextView });
        await resetRows({ tableId, take: 200, ...nextView });
        navigationRequest.current++;
        parentRef.current?.scrollTo({ top: 0 });
      }
      await utils.row.getRows.invalidate({ tableId }, { refetchType: "none" });
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
        utils.row.getRows.cancel(rowQuery),
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
      await utils.row.getRows.invalidate({ tableId }, { refetchType: "none" });
      const nextView = filter?.columnId === column.id ? { sort, search } : view;
      setViewSelection({ tableId, view: nextView });
      await resetRows({ tableId, take: 200, ...nextView });
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
    isFetching: rowsFetching,
  } = api.row.getRows.useInfiniteQuery(rowQuery, {
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: !!tableId,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  /* ---------------- FLATTEN ROWS ---------------- */
  const rows = useMemo(
    () => rowPages?.pages.flatMap((p) => p.formattedRows) ?? [],
    [rowPages],
  );

  const bounds = useMemo(
    () =>
      rangeBounds(
        selection,
        rows.map((row) => row.id),
        table?.columns.map((column) => column.id) ?? [],
      ),
    [selection, rows, table],
  );
  const selectCell = useCallback(
    (rowId: string, columnId: string, extend: boolean, focusOnly = false) => {
      setSelection((current) => {
        if (
          focusOnly &&
          current?.end.rowId === rowId &&
          current.end.columnId === columnId
        )
          return current;
        const end = { rowId, columnId };
        return { anchor: extend && current ? current.anchor : end, end };
      });
    },
    [],
  );

  async function pasteRange(rowId: string, columnId: string, text: string) {
    if (rowOperation.current || pendingCells.current.size || !table) return;
    rowOperation.current = true;
    setRowBusy(true);
    setPasting(true);
    setRowError(null);
    navigationRequest.current++;
    let committed = false;
    let previous: CachedCellChange[] = [];
    let optimistic = false;
    try {
      const matrix = readCellRange(text);
      const startRow = rows.findIndex((row) => row.id === rowId);
      const startColumn = table.columns.findIndex(
        (column) => column.id === columnId,
      );
      if (startRow < 0 || startColumn < 0)
        throw new Error("Select a cell before pasting.");
      const width = matrix[0]?.length ?? 0;
      if (startColumn + width > table.columns.length)
        throw new Error(
          "Paste extends beyond the existing columns. Add columns first.",
        );
      // Validate all column values before fetching or writing anything.
      for (const values of matrix)
        for (const [offset, value] of values.entries()) {
          const column = table.columns[startColumn + offset];
          if (column) parseCellValue(column.type, value);
        }
      let available = rows;
      while (available.length < startRow + matrix.length) {
        const result = await fetchNextPage({ cancelRefetch: false });
        if (result.error) throw new Error(result.error.message);
        const next =
          result.data?.pages.flatMap((page) => page.formattedRows) ?? [];
        if (next.length <= available.length)
          throw new Error(
            "Paste extends beyond the existing rows. Add rows first.",
          );
        available = next;
      }
      const cells = matrix.flatMap((values, rowOffset) =>
        values.map((value, columnOffset) => {
          const row = available[startRow + rowOffset];
          const column = table.columns[startColumn + columnOffset];
          if (!row || !column)
            throw new Error("Paste destination is unavailable.");
          return { rowId: row.id, columnId: column.id, value };
        }),
      );
      await utils.row.getRows.cancel(rowQuery);
      const optimisticCells = cells.map((cell) => {
        const column = table.columns.find(
          (column) => column.id === cell.columnId,
        );
        if (!column) throw new Error("Paste destination is unavailable.");
        return {
          rowId: cell.rowId,
          columnId: cell.columnId,
          ...parseCellValue(column.type, cell.value),
        };
      });
      previous = captureCachedCells(
        utils.row.getRows.getInfiniteData(rowQuery),
        optimisticCells,
      );
      utils.row.getRows.setInfiniteData(rowQuery, (data) =>
        replaceCachedCells(data, optimisticCells),
      );
      optimistic = true;
      const last = cells.at(-1);
      if (last)
        setSelection({
          anchor: { rowId, columnId },
          end: { rowId: last.rowId, columnId: last.columnId },
        });
      const saved = await updateCells({ tableId, cells });
      committed = true;
      utils.row.getRows.setInfiniteData(rowQuery, (data) =>
        replaceCachedCells(data, saved),
      );
      await utils.row.getRows.invalidate({ tableId }, { refetchType: "none" });
      if (
        search ||
        cells.some(
          (cell) =>
            cell.columnId === sort?.columnId ||
            cell.columnId === filter?.columnId,
        )
      ) {
        setSelection(null);
        setFocusTarget(null);
        parentRef.current?.scrollTo({ top: 0 });
        await resetRows(rowQuery);
      }
    } catch (cause) {
      if (optimistic && !committed) {
        utils.row.getRows.setInfiniteData(rowQuery, (data) =>
          applyCachedCellChanges(data, previous),
        );
      }
      setRowError(
        committed
          ? "Paste saved, but the view could not be refreshed. Reload the page."
          : `Paste failed: ${cause instanceof Error ? cause.message : "Could not paste cells"}.${optimistic ? " Previous values were restored." : ""}`,
      );
    } finally {
      rowOperation.current = false;
      setRowBusy(false);
      setPasting(false);
    }
  }

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
    (
      rowId: string,
      columnId: string,
      direction: CellDirection,
      extend = false,
    ) => {
      if (
        rowOperation.current ||
        !table ||
        ((sort || filter || search) && pendingCells.current.size)
      )
        return false;
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
      const focusDestination = (nextRowId: string) => {
        const end = { rowId: nextRowId, columnId: column.id };
        setSelection((current) => ({
          anchor: extend ? (current?.anchor ?? { rowId, columnId }) : end,
          end,
        }));
        setFocusTarget(end);
      };
      if (row) focusDestination(row.id);
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
            if (nextRow) focusDestination(nextRow.id);
            else if (result.error)
              setRowError("Could not load the next row. Try again.");
          })
          .catch(() => setRowError("Could not load the next row. Try again."));
      }
      return true;
    },
    [rows, table, sort, filter, search, hasNextPage, fetchNextPage],
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
      const width = getColumnWidth(focusTarget.columnId);
      const left =
        ROW_CONTROL_WIDTH +
        (table?.columns ?? [])
          .slice(0, columnIndex)
          .reduce((total, column) => total + getColumnWidth(column.id), 0);
      const right = left + width;
      if (width > viewport.clientWidth - ROW_CONTROL_WIDTH)
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
  }, [
    focusTarget,
    rowBusy,
    rows,
    table,
    virtualItems,
    rowVirtualizer,
    getColumnWidth,
  ]);

  /* ---------------- INFINITE SCROLL ---------------- */
  useEffect(() => {
    const checkLoadMore = async () => {
      if (rowOperation.current || pendingCells.current.size || rowsError)
        return;
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
    rowsError,
    pendingCount,
    rowBusy,
    columnBusy,
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
  if (tableError) return <div role="alert">{tableError.message}</div>;
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
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h1
          className="min-w-0 truncate text-xl font-semibold"
          title={table.name}
        >
          {table.name}
        </h1>
        <ResourceNameEditor resource="table" id={tableId} name={table.name} />
        <DeleteResourceButton
          resource="table"
          onPendingChange={(pending) => {
            rowOperation.current = pending;
            setTableDeleting(pending);
          }}
          id={tableId}
          name={table.name}
          disabled={pendingCount > 0 || rowBusy || columnBusy || tableDeleting}
        />
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
            Drag a column’s right edge to resize. Focus the resize handle and
            use Left/Right arrows; Home resets its width. Widths are saved in
            this browser.
          </p>
          <p>
            Shift-click or Shift+arrows selects a range. Ctrl/Cmd+C copies the
            range. Ctrl/Cmd+V pastes up to 1,000 cells from the focused cell.
            Add destination rows and columns first.
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
            pendingCount > 0 || rowBusy || columnBusy || tableDeleting
              ? "h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-blue-100 border-t-blue-600 motion-reduce:animate-none"
              : saveError || rowError || columnError
                ? "h-2 w-2 shrink-0 rounded-full bg-red-500"
                : "h-2 w-2 shrink-0 rounded-full bg-green-500"
          }
        />
        <span>
          {pendingCount > 0
            ? `Saving ${pendingCount} cell${pendingCount === 1 ? "" : "s"}…`
            : tableDeleting
              ? "Deleting table…"
              : columnBusy
                ? reordering
                  ? "Reordering columns…"
                  : typeTarget
                    ? "Changing column type…"
                    : "Deleting column…"
                : rowBusy
                  ? pasting
                    ? "Saving pasted cells…"
                    : "Updating rows…"
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
      <form
        className="mb-3 flex flex-wrap items-center gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void manageRow("create");
        }}
      >
        <button
          type="submit"
          disabled={rowBusy || columnBusy || tableDeleting || pendingCount > 0}
          className="rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50 disabled:opacity-50"
        >
          {rowBusy
            ? "Updating rows…"
            : Number(rowCount) === 1
              ? "+ Add row"
              : "+ Add rows"}
        </button>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          Rows
          <input
            aria-label="Number of rows to add"
            type="number"
            min={1}
            max={1000}
            step={1}
            required
            value={rowCount}
            disabled={
              rowBusy || columnBusy || tableDeleting || pendingCount > 0
            }
            onChange={(event) => setRowCount(event.target.value)}
            className="w-24 rounded border border-slate-300 bg-white px-2 py-1"
          />
        </label>
        <InfoTooltip label="Row management tips">
          <p>
            New rows follow the selected sort, or appear at the top in default
            order. A filter or search may hide new blank rows. Use the trash
            icon beside a row number to delete it after confirmation.
          </p>
          <p>Finish pending cell saves before adding or deleting rows.</p>
        </InfoTooltip>
      </form>
      <RowSearchControls
        key={`${tableId}:${search ?? ""}`}
        search={search}
        disabled={rowBusy || columnBusy || tableDeleting || pendingCount > 0}
        onChange={(nextSearch) =>
          void changeView({ ...view, search: nextSearch })
        }
      />
      <RowSortControls
        columns={table.columns}
        sort={sort}
        disabled={rowBusy || columnBusy || tableDeleting || pendingCount > 0}
        onChange={(nextSort) => void changeView({ ...view, sort: nextSort })}
      />
      <RowFilterControls
        key={`${tableId}:${rowFilterKey(filter)}:${table.columns.map((column) => `${column.id}:${column.type}`).join(",")}`}
        columns={table.columns}
        filter={filter}
        disabled={rowBusy || columnBusy || tableDeleting || pendingCount > 0}
        onChange={(nextFilter) =>
          void changeView({ ...view, filter: nextFilter })
        }
      />
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
      {rowsError && (
        <div
          role="alert"
          className="mb-2 flex items-center gap-3 text-sm text-red-700"
        >
          <span>Could not load rows: {rowsError.message}</span>
          <button
            type="button"
            disabled={
              rowBusy ||
              columnBusy ||
              tableDeleting ||
              pendingCount > 0 ||
              rowsFetching
            }
            onClick={() => void changeView(view)}
            className="underline disabled:opacity-50"
          >
            Retry
          </button>
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
              disabled={
                rowBusy || columnBusy || tableDeleting || pendingCount > 0
              }
              onClick={() => void manageRow("delete", deleteTarget.id)}
              className="rounded bg-red-700 px-3 py-1 text-white disabled:opacity-50"
            >
              Delete row
            </button>
            <button
              type="button"
              disabled={rowBusy || columnBusy || tableDeleting}
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
      {!rows.length && !rowsError && (
        <p className="mb-2 text-sm text-gray-600">
          {filter || search
            ? "No rows match your search and filter settings. Change or clear them to see more rows."
            : "This table has no rows yet. Add a row to start entering data."}
        </p>
      )}

      {bounds && (
        <p className="mb-2 text-sm text-slate-600" role="status">
          Selected {bounds.bottom - bounds.top + 1} rows ×{" "}
          {bounds.right - bounds.left + 1} columns.
        </p>
      )}
      <div
        onCopyCapture={(event) => {
          if (
            event.target instanceof Element &&
            event.target.closest('input, textarea, [contenteditable="true"]')
          )
            return;
          const cell =
            clipboardCell(event.target) ??
            clipboardCell(document.activeElement);
          if (!cell || !event.currentTarget.contains(cell) || !bounds || !table)
            return;
          event.preventDefault();
          event.stopPropagation();
          const values = rows.slice(bounds.top, bounds.bottom + 1).map((row) =>
            table.columns.slice(bounds.left, bounds.right + 1).map((column) => {
              const cell = row.cellsByColumnId[column.id];
              return String(
                (column.type === "TEXT"
                  ? cell?.textValue
                  : cell?.numberValue) ?? "",
              );
            }),
          );
          event.clipboardData.setData("text/plain", writeCellRange(values));
        }}
        onPasteCapture={(event) => {
          if (
            event.target instanceof Element &&
            event.target.closest('input, textarea, [contenteditable="true"]')
          )
            return;
          const cell =
            clipboardCell(event.target) ??
            clipboardCell(document.activeElement);
          if (!cell || !event.currentTarget.contains(cell)) return;
          const { rowId, columnId } = cell.dataset;
          if (!rowId || !columnId) return;
          event.preventDefault();
          event.stopPropagation();
          if (rowOperation.current || pendingCells.current.size) {
            setRowError("Wait for pending changes before pasting.");
            return;
          }
          if (!event.clipboardData.types.includes("text/plain")) {
            setRowError("Paste text or spreadsheet cells.");
            return;
          }
          void pasteRange(
            rowId,
            columnId,
            event.clipboardData.getData("text/plain"),
          );
        }}
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
            width:
              ROW_CONTROL_WIDTH +
              table.columns.reduce(
                (total, column) => total + getColumnWidth(column.id),
                0,
              ),
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
                  onResize={(width) => resizeColumn(col.id, width)}
                  columnId={col.id}
                  canMoveLeft={columnIndex > 0}
                  canMoveRight={columnIndex < table.columns.length - 1}
                  onMove={(direction) => void reorderColumn(col.id, direction)}
                  deleteDisabled={
                    rowBusy || columnBusy || tableDeleting || pendingCount > 0
                  }
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
                  width={`${getColumnWidth(col.id)}px`}
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
                      disabled={
                        rowBusy ||
                        columnBusy ||
                        tableDeleting ||
                        pendingCount > 0
                      }
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
                  {table.columns.map((col, columnIndex) => {
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
                        width={`${getColumnWidth(col.id)}px`}
                        disabled={rowBusy || columnBusy || tableDeleting}
                        selected={
                          !!bounds &&
                          virtualRow.index >= bounds.top &&
                          virtualRow.index <= bounds.bottom &&
                          columnIndex >= bounds.left &&
                          columnIndex <= bounds.right
                        }
                        onSelect={selectCell}
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
