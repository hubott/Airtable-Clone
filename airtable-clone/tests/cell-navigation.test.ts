import assert from "node:assert/strict";
import { test } from "node:test";
import { getCellDestination } from "../src/utils/cell-navigation";

void test("arrows move within the grid without wrapping columns", () => {
  assert.deepEqual(getCellDestination(1, 1, "up", 3, 3), { row: 0, column: 1 });
  assert.deepEqual(getCellDestination(1, 1, "down", 3, 3), {
    row: 2,
    column: 1,
  });
  assert.deepEqual(getCellDestination(1, 1, "left", 3, 3), {
    row: 1,
    column: 0,
  });
  assert.deepEqual(getCellDestination(1, 1, "right", 3, 3), {
    row: 1,
    column: 2,
  });
  assert.equal(getCellDestination(1, 0, "left", 3, 3), null);
  assert.equal(getCellDestination(1, 2, "right", 3, 3), null);
  assert.equal(getCellDestination(0, 1, "up", 3, 3), null);
});
void test("Tab and Shift+Tab wrap between rows and stop at table boundaries", () => {
  assert.deepEqual(getCellDestination(0, 2, "next", 3, 3), {
    row: 1,
    column: 0,
  });
  assert.deepEqual(getCellDestination(1, 0, "previous", 3, 3), {
    row: 0,
    column: 2,
  });
  assert.equal(getCellDestination(0, 0, "previous", 3, 3), null);
  assert.equal(getCellDestination(2, 2, "next", 3, 3), null);
});
void test("navigation requests the next unloaded row only when another page exists", () => {
  assert.deepEqual(getCellDestination(199, 1, "next", 200, 2, true), {
    row: 200,
    column: 0,
  });
  assert.deepEqual(getCellDestination(199, 1, "down", 200, 2, true), {
    row: 200,
    column: 1,
  });
  assert.equal(getCellDestination(199, 1, "down", 200, 2, false), null);
  assert.equal(getCellDestination(-1, 0, "next", 200, 2, true), null);
  assert.equal(getCellDestination(0, -1, "next", 200, 2, true), null);
  assert.equal(getCellDestination(0, 0, "next", 0, 0), null);
});
