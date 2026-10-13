import { Prisma } from "../../../generated/prisma";
import { TRPCError } from "@trpc/server";
import { convertColumnValue } from "~/utils/column-conversion";

export async function scanColumnConversion(
  db: Prisma.TransactionClient,
  columnId: string,
  from: "TEXT" | "NUMBER",
  to: "TEXT" | "NUMBER",
  apply = false,
) {
  let cursor: string | undefined;
  let total = 0;
  let invalidCount = 0;
  const samples: { rowId: string; value: string }[] = [];
  while (true) {
    const cells = await db.cell.findMany({
      where: { columnId, ...(cursor ? { id: { gt: cursor } } : {}) },
      orderBy: { id: "asc" },
      take: 1000,
      select: { id: true, rowId: true, textValue: true, numberValue: true },
    });
    if (!cells.length) break;
    const converted: {
      id: string;
      textValue: string | null;
      numberValue: number | null;
    }[] = [];
    for (const cell of cells) {
      total++;
      try {
        converted.push({ id: cell.id, ...convertColumnValue(from, to, cell) });
      } catch {
        invalidCount++;
        if (samples.length < 5)
          samples.push({
            rowId: cell.rowId,
            value: String(
              from === "TEXT"
                ? (cell.textValue ?? "")
                : (cell.numberValue ?? ""),
            ).slice(0, 100),
          });
      }
    }
    if (apply && invalidCount)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "Some values cannot be converted. Refresh the preview and correct them before trying again.",
      });
    if (apply && converted.length)
      await db.$executeRaw(Prisma.sql`
      UPDATE "Cell" AS c
      SET "textValue"=v."textValue", "numberValue"=v."numberValue"
      FROM (VALUES ${Prisma.join(converted.map((cell) => Prisma.sql`(${cell.id}::text,${cell.textValue}::text,${cell.numberValue}::double precision)`))}) AS v("id","textValue","numberValue")
      WHERE c."id"=v."id" AND c."columnId"=${columnId}
    `);
    cursor = cells.at(-1)?.id;
    if (cells.length < 1000) break;
  }
  return { total, invalidCount, samples, canConvert: invalidCount === 0 };
}
