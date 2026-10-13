export type CellDirection =
  | "up"
  | "down"
  | "left"
  | "right"
  | "next"
  | "previous";

export function getCellDestination(
  row: number,
  column: number,
  direction: CellDirection,
  rowCount: number,
  columnCount: number,
  hasNextPage = false,
) {
  if (row < 0 || column < 0 || row >= rowCount || column >= columnCount)
    return null;
  let nextRow = row;
  let nextColumn = column;
  if (direction === "up") nextRow--;
  if (direction === "down") nextRow++;
  if (direction === "left") nextColumn--;
  if (direction === "right") nextColumn++;
  if (direction === "next" || direction === "previous") {
    const offset = row * columnCount + column + (direction === "next" ? 1 : -1);
    nextRow = Math.floor(offset / columnCount);
    nextColumn = ((offset % columnCount) + columnCount) % columnCount;
  }
  if (
    nextColumn < 0 ||
    nextColumn >= columnCount ||
    nextRow < 0 ||
    nextRow >= rowCount + (hasNextPage ? 1 : 0)
  )
    return null;
  return { row: nextRow, column: nextColumn };
}
