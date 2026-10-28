import assert from "node:assert/strict";
import { test } from "node:test";
import {
  rangeBounds,
  readCellRange,
  writeCellRange,
} from "../src/utils/cell-range";

void test("clipboard ranges preserve blanks, whitespace, quoted tabs and newlines", () => {
  const values = [
    ["  hello ", "", "line\nnext"],
    ['say "hi"', "a\tb", ""],
  ];
  assert.deepEqual(readCellRange(writeCellRange(values)), values);
  assert.deepEqual(readCellRange("one\ttwo\r\nthree\t\r\n"), [
    ["one", "two"],
    ["three", ""],
  ]);
  assert.deepEqual(readCellRange(""), [[""]]);
  assert.deepEqual(readCellRange("\n"), [[""]]);
});

void test("malformed and oversized clipboard ranges are rejected", () => {
  for (const value of [
    "a\tb\nc",
    '"unterminated',
    '"value"trailing',
    Array(1002).fill("a").join("\t"),
    "a".repeat(1_000_001),
  ]) {
    assert.throws(() => readCellRange(value));
  }
});

void test("range bounds follow stable IDs and normalize reversed selections", () => {
  const range = {
    anchor: { rowId: "r3", columnId: "c2" },
    end: { rowId: "r1", columnId: "c1" },
  };
  assert.deepEqual(rangeBounds(range, ["r1", "r2", "r3"], ["c1", "c2"]), {
    top: 0,
    bottom: 2,
    left: 0,
    right: 1,
  });
  assert.equal(rangeBounds(range, ["r1"], ["c1", "c2"]), null);
});

void test("copying a 2 by 3 rectangle preserves row and column positions on paste", () => {
  const values = [
    ["A1", "B1", "C1"],
    ["A2", "B2", "C2"],
  ];
  const clipboard = writeCellRange(values);
  assert.equal(clipboard, "A1\tB1\tC1\nA2\tB2\tC2");
  assert.deepEqual(readCellRange(clipboard), values);
  assert.deepEqual(readCellRange(writeCellRange([values[0] ?? []])), [
    values[0],
  ]);
});
