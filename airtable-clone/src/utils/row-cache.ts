import type { RouterOutputs } from "~/trpc/react";
import type { Rows } from "./cell-cache";

export function prependCachedRow(
  data: Rows | undefined,
  row: RouterOutputs["row"]["createRow"],
): Rows | undefined {
  return prependCachedRows(data, [row]);
}

export function prependCachedRows(
  data: Rows | undefined,
  rows: RouterOutputs["row"]["createRows"],
): Rows | undefined {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((page, index) =>
      index === 0
        ? { ...page, formattedRows: [...rows, ...page.formattedRows] }
        : page,
    ),
  };
}

export function removeCachedRow(
  data: Rows | undefined,
  rowId: string,
): Rows | undefined {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((page) =>
      page.formattedRows.some((row) => row.id === rowId)
        ? {
            ...page,
            formattedRows: page.formattedRows.filter((row) => row.id !== rowId),
          }
        : page,
    ),
  };
}
