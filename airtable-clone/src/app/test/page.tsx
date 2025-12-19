"use client";

import { api } from "~/trpc/react";

export default function TestPage() {
  const tableQuery = api.table.getTableWithColumns.useQuery({ tableId: "1" });

  if (tableQuery.isLoading) return <p>Loading...</p>;
  if (tableQuery.error) return <p>Error: {tableQuery.error.message}</p>;

  return <pre>{JSON.stringify(tableQuery.data, null, 2)}</pre>;
}
