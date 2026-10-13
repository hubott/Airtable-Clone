export function parseCellValue(type: "TEXT" | "NUMBER", value: string) {
  if (type === "TEXT") {
    return { textValue: value === "" ? null : value, numberValue: null };
  }
  const trimmed = value.trim();
  if (trimmed === "") return { textValue: null, numberValue: null };
  const numberValue = Number(trimmed);
  if (
    !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(trimmed) ||
    !Number.isFinite(numberValue)
  ) {
    throw new Error("Enter a valid finite number");
  }
  return { textValue: null, numberValue };
}
