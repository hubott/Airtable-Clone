import assert from "node:assert/strict";
import { test } from "node:test";
import { readSingleCellClipboard } from "../src/utils/cell-clipboard";

void test("accepts plain values and preserves meaningful whitespace", () => {
  for (const value of ["", "0", "-3.5", "text with symbols !", "  text  "]) {
    assert.equal(readSingleCellClipboard(value), value);
  }
});
void test("accepts single spreadsheet cells with a terminating newline", () => {
  assert.equal(readSingleCellClipboard("123\r\n"), "123");
  assert.equal(readSingleCellClipboard("text\n"), "text");
  assert.equal(readSingleCellClipboard("\r\n"), "");
});
void test("rejects multiple rows or columns rather than silently truncating them", () => {
  for (const value of ["a\tb", "a\nb", "a\r\nb\r\n", "a\r\nb", "a\n\n", "\t"]) {
    assert.throws(() => readSingleCellClipboard(value), /one cell at a time/);
  }
});
