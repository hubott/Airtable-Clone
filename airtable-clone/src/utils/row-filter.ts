import { z } from "zod";
import { parseCellValue } from "./cell-value";

const columnId = z.string().min(1);
export const rowFilterSchema = z.union([
  z.object({
    columnId,
    type: z.literal("TEXT"),
    operator: z.enum(["contains", "equals", "startsWith"]),
    value: z.string().min(1, "Enter a text value").max(1000),
  }),
  z.object({
    columnId,
    type: z.literal("NUMBER"),
    operator: z.enum(["equals", "gt", "gte", "lt", "lte"]),
    value: z.number().finite(),
  }),
  z.object({
    columnId,
    type: z.enum(["TEXT", "NUMBER"]),
    operator: z.enum(["isEmpty", "isNotEmpty"]),
  }),
]);
export type RowFilter = z.infer<typeof rowFilterSchema>;

export const textFilterOperators = [
  ["contains", "contains"],
  ["equals", "equals"],
  ["startsWith", "starts with"],
  ["isEmpty", "is empty"],
  ["isNotEmpty", "is not empty"],
] as const;
export const numberFilterOperators = [
  ["equals", "="],
  ["gt", ">"],
  ["gte", "≥"],
  ["lt", "<"],
  ["lte", "≤"],
  ["isEmpty", "is empty"],
  ["isNotEmpty", "is not empty"],
] as const;

export function parseRowFilter(
  id: string,
  type: "TEXT" | "NUMBER",
  operator: string,
  draft: string,
): RowFilter {
  let value: string | number | null = draft;
  if (
    operator !== "isEmpty" &&
    operator !== "isNotEmpty" &&
    type === "NUMBER"
  ) {
    value = parseCellValue("NUMBER", draft).numberValue;
    if (value === null) throw new Error("Enter a number to compare");
  }
  const result = rowFilterSchema.safeParse({
    columnId: id,
    type,
    operator,
    value,
  });
  if (!result.success)
    throw new Error(result.error.issues[0]?.message ?? "Invalid filter");
  return result.data;
}

// Stable context independent of object property order; included in pagination cursors.
export function rowFilterKey(filter?: RowFilter) {
  return filter
    ? JSON.stringify([
        filter.columnId,
        filter.type,
        filter.operator,
        "value" in filter ? filter.value : null,
      ])
    : "";
}
