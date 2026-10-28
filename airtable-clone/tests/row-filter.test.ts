import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseRowFilter,
  rowFilterSchema,
  rowFilterKey,
} from "../src/utils/row-filter";

void test("numeric filters accept decimal/scientific notation and zero but reject invalid or missing values", () => {
  assert.deepEqual(parseRowFilter("amount", "NUMBER", "gte", " -1.5e2 "), {
    columnId: "amount",
    type: "NUMBER",
    operator: "gte",
    value: -150,
  });
  assert.equal(
    "value" in parseRowFilter("amount", "NUMBER", "equals", "0"),
    true,
  );
  for (const draft of ["", " ", "Infinity", "NaN", "1e999", "0x10", "1,000"])
    assert.throws(() => parseRowFilter("amount", "NUMBER", "equals", draft));
  for (const value of [NaN, Infinity, -Infinity, "12"])
    assert.equal(
      rowFilterSchema.safeParse({
        columnId: "amount",
        type: "NUMBER",
        operator: "equals",
        value,
      }).success,
      false,
    );
});
void test("filters validate column types and operators while preserving meaningful text whitespace", () => {
  assert.deepEqual(parseRowFilter("name", "TEXT", "contains", "  Alpha "), {
    columnId: "name",
    type: "TEXT",
    operator: "contains",
    value: "  Alpha ",
  });
  assert.throws(() => parseRowFilter("name", "TEXT", "contains", ""));
  assert.throws(() =>
    parseRowFilter("name", "TEXT", "contains", "x".repeat(1001)),
  );
  assert.throws(() => parseRowFilter("name", "TEXT", "gt", "5"));
  assert.throws(() => parseRowFilter("amount", "NUMBER", "contains", "5"));
  assert.throws(() => parseRowFilter("", "TEXT", "equals", "name"));
  assert.deepEqual(
    parseRowFilter("amount", "NUMBER", "isEmpty", "invalid ignored draft"),
    { columnId: "amount", type: "NUMBER", operator: "isEmpty" },
  );
});
void test("filter cursor keys distinguish conditions and do not depend on property order", () => {
  const filter = parseRowFilter("name", "TEXT", "equals", "Alpha");
  assert.equal(
    rowFilterKey(filter),
    rowFilterKey({ ...filter, columnId: "name" }),
  );
  assert.notEqual(
    rowFilterKey(filter),
    rowFilterKey(parseRowFilter("name", "TEXT", "equals", "Beta")),
  );
  assert.notEqual(rowFilterKey(filter), rowFilterKey(undefined));
});
