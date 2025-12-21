"use client"

import { useEffect, useMemo, useRef } from "react"
import { useParams } from "next/navigation"
import { api } from "~/trpc/react"
import { useVirtualizer } from "@tanstack/react-virtual"

export default function TablePage() {
  const params = useParams()
  const tableId = params.tableId as string
  const parentRef = useRef<HTMLDivElement>(null)

  /* ---------------- TABLE META ---------------- */
  const { data: table, isLoading: tableLoading } =
    api.table.getTableWithColumns.useQuery({ tableId }, { enabled: !!tableId })

  /* ---------------- ROWS (INFINITE) ---------------- */
  const {
    data: rowPages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: rowsLoading,
  } = api.row.getRows.useInfiniteQuery(
    { tableId, take: 1000 }, // smaller page size for faster loads
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    }
  )

  /* ---------------- FLATTEN ROWS ---------------- */
  const rows = useMemo(
    () => rowPages?.pages.flatMap((p) => p.formattedRows) ?? [],
    [rowPages]
  )

  /* ---------------- VIRTUALIZER ---------------- */
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 400,
  })

  

  /* ---------------- INFINITE SCROLL ---------------- */
  useEffect(() => {
    const checkLoadMore = () => {
      const virtualItems = rowVirtualizer.getVirtualItems()
      const lastItem = virtualItems.at(-1)
      if (!lastItem) return

      if (lastItem.index >= rows.length - 5 && hasNextPage && !isFetchingNextPage) {
        fetchNextPage()
      }
    }

    // Check on mount and whenever rows change
    checkLoadMore()

    const el = parentRef.current
    el?.addEventListener("scroll", checkLoadMore)
    return () => el?.removeEventListener("scroll", checkLoadMore)
  }, [rows.length, hasNextPage, isFetchingNextPage, fetchNextPage, rowVirtualizer])

  // Force virtualizer to recompute when rows update
  useEffect(() => {
    rowVirtualizer.measure()
  }, [rows.length, rowVirtualizer])

  /* ---------------- LOADING STATES ---------------- */
  if (tableLoading || rowsLoading) return <div>Loading…</div>
  if (!table) return <div>Table not found</div>

  /* ---------------- RENDER ---------------- */
  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">{table.name}</h1>

      <div
        ref={parentRef}
        className="h-[80vh] overflow-auto overflow-x-auth relative border border-gray-300"
      >
        <table className="table-fixed border-collapse border border-gray-300 w-full">
          <thead className="sticky top-0 bg-white z-10">
            <tr>
              {table.columns.map((col) => (
                <th
                  key={col.id}
                  className="border border-gray-300 px-2 py-1 text-left"
                  style={{ width: `${100 / table.columns.length}%` }}
                >
                  {col.name}
                </th>
              ))}
            </tr>
          </thead>

          <tbody
            style={{
              height: rowVirtualizer.getTotalSize(),
              position: "relative",
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const row = rows[virtualRow.index]
              if (!row) return null

              return (
                <tr
                  key={`${row.id}-${virtualRow.index}`} // unique key
                  style={{
                    position: "absolute",
                    top: 0,
                    transform: `translateY(${virtualRow.start}px)`,
                    width: "100%",
                    display: "flex",
                    height: '36px',
                    alignItems: 'center',
                  }}
                >
                  {table.columns.map((col) => {
                    const cell = row.cellsByColumnId?.[col.id]

                    return (
                      <td
                        key={col.id}
                        className="border border-gray-300 px-2 py-1"
                        style={{
                          width: `${100 / table.columns.length}%`,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          height: "100%", 
                          minHeight: 36, 
                        }}
                      >
                        {col.type === "TEXT"
                          ? cell?.textValue ?? ""
                          : cell?.numberValue ?? ""}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>

        {isFetchingNextPage && (
          <div className="py-2 text-center text-sm text-gray-500">
            Loading more…
          </div>
        )}
      </div>
    </div>
  )
}
