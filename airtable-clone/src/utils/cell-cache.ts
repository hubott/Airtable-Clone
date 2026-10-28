import type { InfiniteData } from "@tanstack/react-query";
import type { RouterOutputs } from "~/trpc/react";

export type Rows = InfiniteData<
  RouterOutputs["row"]["getRows"],
  RouterOutputs["row"]["getRows"]["nextCursor"]
>;
export type CellValue = RouterOutputs["cell"]["updateCell"];

// Copy only the affected page, row and cell map; preserve all other references.
export function replaceCachedCell(
  data: Rows | undefined,
  rowId: string,
  columnId: string,
  cell: CellValue | undefined,
): Rows | undefined {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((page) => {
      if (!page.formattedRows.some((row) => row.id === rowId)) return page;
      return {
        ...page,
        formattedRows: page.formattedRows.map((row) => {
          if (row.id !== rowId) return row;
          const cellsByColumnId = { ...row.cellsByColumnId };
          if (cell) cellsByColumnId[columnId] = cell;
          else delete cellsByColumnId[columnId];
          return { ...row, cellsByColumnId };
        }),
      };
    }),
  };
}

export function removeCachedColumn(
  data: Rows | undefined,
  columnId: string,
): Rows | undefined {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((page) => {
      let changed = false;
      const formattedRows = page.formattedRows.map((row) => {
        if (!(columnId in row.cellsByColumnId)) return row;
        changed = true;
        const cellsByColumnId = { ...row.cellsByColumnId };
        delete cellsByColumnId[columnId];
        return { ...row, cellsByColumnId };
      });
      return changed ? { ...page, formattedRows } : page;
    }),
  };
}

export type CachedCellChange = {
  rowId: string;
  columnId: string;
  cell: CellValue | undefined;
};

export function captureCachedCells(
  data: Rows | undefined,
  cells: Pick<CellValue, "rowId" | "columnId">[],
): CachedCellChange[] {
  const rows = new Map(
    data?.pages
      .flatMap((page) => page.formattedRows)
      .map((row) => [row.id, row]),
  );
  return cells.map(({ rowId, columnId }) => ({
    rowId,
    columnId,
    cell: rows.get(rowId)?.cellsByColumnId[columnId],
  }));
}

// Apply or roll back a range in one pass, preserving unrelated cells and pages.
export function applyCachedCellChanges(
  data: Rows | undefined,
  changes: CachedCellChange[],
): Rows | undefined {
  if (!data || !changes.length) return data;
  const byRow = new Map<string, CachedCellChange[]>();
  for (const change of changes) {
    const group = byRow.get(change.rowId) ?? [];
    group.push(change);
    byRow.set(change.rowId, group);
  }
  return {
    ...data,
    pages: data.pages.map((page) => {
      let changed = false;
      const formattedRows = page.formattedRows.map((row) => {
        const updates = byRow.get(row.id);
        if (!updates) return row;
        changed = true;
        const cellsByColumnId = { ...row.cellsByColumnId };
        for (const { columnId, cell } of updates) {
          if (cell) cellsByColumnId[columnId] = cell;
          else delete cellsByColumnId[columnId];
        }
        return { ...row, cellsByColumnId };
      });
      return changed ? { ...page, formattedRows } : page;
    }),
  };
}

export function replaceCachedCells(
  data: Rows | undefined,
  cells: CellValue[],
): Rows | undefined {
  return applyCachedCellChanges(
    data,
    cells.map((cell) => ({ rowId: cell.rowId, columnId: cell.columnId, cell })),
  );
}
