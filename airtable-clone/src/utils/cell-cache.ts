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
