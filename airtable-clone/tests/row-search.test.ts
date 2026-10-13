import assert from "node:assert/strict";
import { test } from "node:test";
import { rowSearchSchema, searchNumber } from "../src/utils/row-search";

void test("search normalizes empty input and limits terms without changing literal characters", () => {
  assert.equal(rowSearchSchema.parse("  Alpha  "), "Alpha");
  assert.equal(rowSearchSchema.parse(" \t "), undefined);
  assert.equal(rowSearchSchema.parse(undefined), undefined);
  assert.equal(rowSearchSchema.parse("%_\\'"), "%_\\'");
  assert.equal(rowSearchSchema.parse("x".repeat(200))?.length, 200);
  assert.throws(() => rowSearchSchema.parse("x".repeat(201)));
});
void test("numeric search matches equivalent finite decimal/scientific values, while other terms remain text", () => {
  assert.equal(searchNumber("1e1"), 10);
  assert.equal(searchNumber("0010"), 10);
  assert.equal(searchNumber("-2"), -2);
  assert.equal(searchNumber("0"), 0);
  for (const term of [
    "",
    " ",
    "0x10",
    "1,000",
    "Infinity",
    "NaN",
    "1e999",
    ">5",
    "Alpha",
  ])
    assert.equal(searchNumber(term), undefined);
});
