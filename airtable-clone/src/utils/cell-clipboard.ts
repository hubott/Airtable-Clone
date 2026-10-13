// Spreadsheet apps commonly terminate even a single copied cell with a newline.
export function readSingleCellClipboard(text: string): string {
  const value = text.replace(/\r\n?/g, "\n").replace(/\n$/, "");
  if (/[\t\n]/.test(value)) {
    throw new Error(
      "Paste one cell at a time. Multi-cell ranges are not supported yet.",
    );
  }
  return value;
}
