import type { Prisma } from "../../../generated/prisma";

// Call only after locking and authorizing the parent resource.
export async function deleteTables(
  tx: Prisma.TransactionClient,
  tableIds: string[],
) {
  if (!tableIds.length) return;
  for (const tableId of tableIds) {
    await tx.$queryRaw`SELECT "id" FROM "Column" WHERE "tableId"=${tableId} ORDER BY "id" FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "Row" WHERE "tableId"=${tableId} ORDER BY "id" FOR UPDATE`;
  }
  await tx.cell.deleteMany({
    where: {
      OR: [
        { row: { tableId: { in: tableIds } } },
        { column: { tableId: { in: tableIds } } },
      ],
    },
  });
  await tx.row.deleteMany({ where: { tableId: { in: tableIds } } });
  await tx.column.deleteMany({ where: { tableId: { in: tableIds } } });
  await tx.table.deleteMany({ where: { id: { in: tableIds } } });
}
