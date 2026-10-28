import { z } from "zod";
import { parseCellValue } from "./cell-value";

// Empty/whitespace searches restore all rows. Use the same normalization on both sides.
export const rowSearchSchema = z
  .string()
  .trim()
  .max(200, "Search must be 200 characters or fewer")
  .transform((value) => value || undefined)
  .optional();

export function searchNumber(search: string): number | undefined {
  try {
    return parseCellValue("NUMBER", search).numberValue ?? undefined;
  } catch {
    return undefined;
  }
}
