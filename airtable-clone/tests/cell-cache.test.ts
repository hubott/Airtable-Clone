import assert from "node:assert/strict";
import { test } from "node:test";
import { replaceCachedCell } from "../src/utils/cell-cache";
import { parseCellValue } from "../src/utils/cell-value";

function fixture(): NonNullable<Parameters<typeof replaceCachedCell>[0]> {
  return {
    pageParams: [null, { id: "row2", order: 1 }],
    pages: [
      {
        formattedRows: [
          {
            id: "row1",
            tableId: "table",
            order: 0,
            cellsByColumnId: {
              col1: {
                rowId: "row1",
                columnId: "col1",
                textValue: "old",
                numberValue: null,
              },
            },
          },
          { id: "row2", tableId: "table", order: 1, cellsByColumnId: {} },
        ],
        nextCursor: { id: "row2", order: 1 },
      },
      {
        formattedRows: [
          { id: "row3", tableId: "table", order: 2, cellsByColumnId: {} },
        ],
        nextCursor: null,
      },
    ],
  };
}

void test("updates one cell while preserving unrelated row/page references and pagination", () => {
  const original = fixture();
  const cell = {
    rowId: "row1",
    columnId: "col1",
    textValue: "new",
    numberValue: null,
  };
  const updated = replaceCachedCell(original, "row1", "col1", cell)!;
  assert.equal(updated.pages[0]?.formattedRows[0]?.cellsByColumnId.col1, cell);
  assert.equal(
    original.pages[0]?.formattedRows[0]?.cellsByColumnId.col1?.textValue,
    "old",
  );
  assert.equal(
    updated.pages[0]?.formattedRows[1],
    original.pages[0]?.formattedRows[1],
  );
  assert.equal(updated.pages[1], original.pages[1]);
  assert.equal(updated.pageParams, original.pageParams);
});

void test("rolling back one failed edit preserves another optimistic edit", () => {
  const original = fixture();
  const previous = original.pages[0]?.formattedRows[0]?.cellsByColumnId.col1;
  const first = replaceCachedCell(original, "row1", "col1", {
    rowId: "row1",
    columnId: "col1",
    textValue: "pending",
    numberValue: null,
  });
  const secondCell = {
    rowId: "row1",
    columnId: "col2",
    textValue: "also pending",
    numberValue: null,
  };
  const second = replaceCachedCell(first, "row1", "col2", secondCell);
  const rolledBack = replaceCachedCell(second, "row1", "col1", previous);
  assert.equal(
    rolledBack?.pages[0]?.formattedRows[0]?.cellsByColumnId.col1,
    previous,
  );
  assert.equal(
    rolledBack?.pages[0]?.formattedRows[0]?.cellsByColumnId.col2,
    secondCell,
  );
});

void test("rollback removes an optimistic cell that did not previously exist", () => {
  const original = fixture();
  const updated = replaceCachedCell(original, "row2", "col1", {
    rowId: "row2",
    columnId: "col1",
    textValue: null,
    numberValue: 0,
  });
  const rolledBack = replaceCachedCell(updated, "row2", "col1", undefined);
  assert.deepEqual(rolledBack?.pages[0]?.formattedRows[1]?.cellsByColumnId, {});
  assert.equal(
    replaceCachedCell(undefined, "row2", "col1", undefined),
    undefined,
  );
});

void test("shared parsing preserves text, clears blank values and rejects invalid numbers", () => {
  assert.deepEqual(parseCellValue("TEXT", "  text  "), {
    textValue: "  text  ",
    numberValue: null,
  });
  assert.deepEqual(parseCellValue("TEXT", ""), {
    textValue: null,
    numberValue: null,
  });
  assert.deepEqual(parseCellValue("NUMBER", "  "), {
    textValue: null,
    numberValue: null,
  });
  assert.deepEqual(parseCellValue("NUMBER", "0"), {
    textValue: null,
    numberValue: 0,
  });
  for (const value of ["0x10", "NaN", "Infinity", "1e999", "12abc"]) {
    assert.throws(() => parseCellValue("NUMBER", value), /finite number/);
  }
});

void test("deleted columns are removed from cell caches while unrelated pages remain unchanged", async () => {
  const { removeCachedColumn } = await import("../src/utils/cell-cache");
  const data = fixture();
  const updated = removeCachedColumn(data, "col1");
  assert.deepEqual(updated?.pages[0]?.formattedRows[0]?.cellsByColumnId, {});
  assert.equal(
    updated?.pages[0]?.formattedRows[1],
    data.pages[0]?.formattedRows[1],
  );
  assert.equal(updated?.pages[1], data.pages[1]);
  assert.equal(updated?.pageParams, data.pageParams);
  assert.equal(
    data.pages[0]?.formattedRows[0]?.cellsByColumnId.col1?.textValue,
    "old",
  );
});
