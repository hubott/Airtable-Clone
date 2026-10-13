import { Prisma } from "~/../generated/prisma";
import type { RowFilter } from "~/utils/row-filter";

// r is the row alias in the view query. EXISTS also handles lazily absent cells.
export function rowFilterSql(filter?: RowFilter): Prisma.Sql {
  if (!filter) return Prisma.empty;
  const value =
    filter.type === "TEXT"
      ? Prisma.sql`f."textValue"`
      : Prisma.sql`f."numberValue"`;
  let comparison: Prisma.Sql;
  if (!("value" in filter)) {
    const exists = Prisma.sql`EXISTS (
      SELECT 1 FROM "Cell" f
      WHERE f."rowId" = r."id" AND f."columnId" = ${filter.columnId} AND ${value} IS NOT NULL
    )`;
    return filter.operator === "isEmpty"
      ? Prisma.sql`AND NOT ${exists}`
      : Prisma.sql`AND ${exists}`;
  }
  if (filter.type === "TEXT") {
    const text = Prisma.sql`lower(${value})`;
    const needle = Prisma.sql`lower(${filter.value})`;
    switch (filter.operator) {
      case "contains":
        comparison = Prisma.sql`strpos(${text}, ${needle}) > 0`;
        break;
      case "startsWith":
        comparison = Prisma.sql`strpos(${text}, ${needle}) = 1`;
        break;
      case "equals":
        comparison = Prisma.sql`${text} = ${needle}`;
        break;
    }
  } else {
    const operators = {
      equals: Prisma.sql`=`,
      gt: Prisma.sql`>`,
      gte: Prisma.sql`>=`,
      lt: Prisma.sql`<`,
      lte: Prisma.sql`<=`,
    };
    comparison = Prisma.sql`${value} ${operators[filter.operator]} ${filter.value}`;
  }
  return Prisma.sql`AND EXISTS (
    SELECT 1 FROM "Cell" f
    WHERE f."rowId" = r."id" AND f."columnId" = ${filter.columnId} AND ${comparison}
  )`;
}
