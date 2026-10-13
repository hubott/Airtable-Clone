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
