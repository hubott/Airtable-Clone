import { Prisma } from "~/../generated/prisma";
import { searchNumber } from "~/utils/row-search";

export function rowSearchSql(search?: string): Prisma.Sql {
  if (!search) return Prisma.empty;
  const number = searchNumber(search);
  return Prisma.sql`AND EXISTS (
    SELECT 1 FROM "Cell" s
    JOIN "Column" sc ON sc."id" = s."columnId" AND sc."tableId" = r."tableId"
    WHERE s."rowId" = r."id" AND (
      (sc."type" = 'TEXT' AND strpos(lower(s."textValue"), lower(${search})) > 0)
      ${number === undefined ? Prisma.empty : Prisma.sql`OR (sc."type" = 'NUMBER' AND s."numberValue" = ${number})`}
    )
  )`;
}
