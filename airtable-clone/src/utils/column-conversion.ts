import { parseCellValue } from "./cell-value";

export function convertColumnValue(
  from: "TEXT" | "NUMBER",
  to: "TEXT" | "NUMBER",
  cell: { textValue: string | null; numberValue: number | null },
) {
  if (from === to) return cell;
  if (to === "NUMBER") return parseCellValue("NUMBER", cell.textValue ?? "");
  if (cell.numberValue !== null && !Number.isFinite(cell.numberValue))
    throw new Error("Invalid stored number");
  return {
    textValue: cell.numberValue === null ? null : String(cell.numberValue),
    numberValue: null,
  };
}
