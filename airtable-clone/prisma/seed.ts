import { PrismaClient } from "../generated/prisma"
import { faker } from "@faker-js/faker"

const prisma = new PrismaClient()

async function seedTable(tableId: string, rowCount = 100_000) {
  const columns = await prisma.column.findMany({
    where: { tableId },
    orderBy: { order: "asc" },
  })

  let rows = []
  let cells = []

  for (let i = 0; i < rowCount; i++) {
    const rowId = crypto.randomUUID()

    rows.push({
      id: rowId,
      tableId,
      order: i,
    })

    for (const col of columns) {
      cells.push({
        id: crypto.randomUUID(),
        rowId,
        columnId: col.id,
        textValue: col.type === "TEXT" ? faker.word.words(3) : null,
        numberValue: col.type === "NUMBER" ? faker.number.int({ max: 1000 }) : null,
      })
    }
  }

  await prisma.row.createMany({ data: rows })
  await prisma.cell.createMany({ data: cells })
}

async function main() {
  const table = await prisma.table.findFirst()
  if (!table) throw new Error("No table found")

  await seedTable(table.id)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
