export type CellPosition = { rowId: string; columnId: string };
export type CellRange = { anchor: CellPosition; end: CellPosition };

export function rangeBounds(
  range: CellRange | null,
  rowIds: string[],
  columnIds: string[],
) {
  if (!range) return null;
  const aRow = rowIds.indexOf(range.anchor.rowId);
  const bRow = rowIds.indexOf(range.end.rowId);
  const aCol = columnIds.indexOf(range.anchor.columnId);
  const bCol = columnIds.indexOf(range.end.columnId);
  if ([aRow, bRow, aCol, bCol].some((index) => index < 0)) return null;
  return {
    top: Math.min(aRow, bRow),
    bottom: Math.max(aRow, bRow),
    left: Math.min(aCol, bCol),
    right: Math.max(aCol, bCol),
  };
}

export function readCellRange(text: string): string[][] {
  if (text.length > 1_000_000) throw new Error("Paste at most 1 MB of text.");
  const normalized = text.replace(/\r\n?/g, "\n");
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  let closed = false;
  for (let index = 0; index < normalized.length; index++) {
    const char = normalized[index];
    if (quoted) {
      if (char === '"') {
        if (normalized[index + 1] === '"') {
          value += '"';
          index++;
        } else {
          quoted = false;
          closed = true;
        }
      } else value += char;
    } else if (char === "\t" || char === "\n") {
      row.push(value);
      value = "";
      closed = false;
      if (char === "\n") {
        rows.push(row);
        row = [];
      }
    } else if (char === '"' && value === "" && !closed) quoted = true;
    else {
      if (closed) throw new Error("Invalid quoted clipboard value.");
      value += char;
    }
  }
  if (quoted) throw new Error("Unterminated quoted clipboard value.");
  if (!normalized.endsWith("\n") || value || row.length || closed) {
    row.push(value);
    rows.push(row);
  }
  if (!rows.length) rows.push([""]);
  const width = rows[0]?.length ?? 0;
  if (rows.some((entry) => entry.length !== width))
    throw new Error("Paste a rectangular range.");
  if (rows.length * width > 1000)
    throw new Error("Paste at most 1,000 cells at a time.");
  return rows;
}

export function writeCellRange(rows: string[][]): string {
  return rows
    .map((row) =>
      row
        .map((value) =>
          /[\t\n\r"]/.test(value)
            ? '"' + value.replace(/"/g, '""') + '"'
            : value,
        )
        .join("\t"),
    )
    .join("\n");
}
