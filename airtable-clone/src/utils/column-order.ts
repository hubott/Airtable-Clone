export function moveColumn<T extends { id: string; order: number }>(
  columns: T[],
  columnId: string,
  direction: "left" | "right",
): T[] {
  const index = columns.findIndex((column) => column.id === columnId);
  const target = index + (direction === "left" ? -1 : 1);
  if (index < 0 || target < 0 || target >= columns.length) return columns;
  const reordered = [...columns];
  const column = reordered[index];
  const neighbor = reordered[target];
  if (!column || !neighbor) return columns;
  reordered[index] = neighbor;
  reordered[target] = column;
  return reordered.map((item, order) => ({ ...item, order }));
}
