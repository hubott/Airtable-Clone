"use client"

import { api } from "~/trpc/react"
import { useParams } from "next/navigation"

export default function TablePage() {
  const params = useParams()
  const tableId = params.tableId as string

  // Early return if no tableId
  if (!tableId) return <div>Table not found</div>
  console.log("Table ID:", tableId)

  const { data: table, isLoading: tableLoading } = api.table.getTableWithColumns.useQuery({ tableId })
  const { data: rowPages, isLoading: rowsLoading } = api.row.getRows.useInfiniteQuery(
    { tableId, take: 50 },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    }
  )

  if (tableLoading || rowsLoading) return <div>Loading...</div>

  const rows = rowPages?.pages.flatMap((page) => page.rows) ?? []

  return (
    <div>
      <h1>{table?.name}</h1>

      <table>
        <thead>
          <tr>
            {table?.columns.map((col) => (
              <th key={col.id}>{col.name}</th>
            ))}
          </tr>
        </thead>

        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              {table?.columns.map((col) => {
                const cell = row.cells.find((c) => c.columnId === col.id)
                return (
                  <td key={col.id}>
                    {col.type === "TEXT" ? cell?.textValue : cell?.numberValue}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
