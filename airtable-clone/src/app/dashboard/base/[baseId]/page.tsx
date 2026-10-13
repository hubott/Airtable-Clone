// src/app/dashboard/base/[baseId]/page.tsx
"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import LoadingSpinner from "~/app/_components/LoadingSpinner";
import { api } from "~/trpc/react";

export default function BasePage() {
  const params = useParams();
  const baseId = params.baseId as string;
  if (!baseId) return <div>No base selected.</div>;

  const { data: tables, isLoading } = api.table.getTablesByBase.useQuery({
    baseId,
  });

  if (isLoading) return <LoadingSpinner label="Loading tables…" />;
  if (!tables || tables.length === 0)
    return <div>No tables found in this base.</div>;

  return (
    <div className="p-4">
      <h1 className="mb-4 text-2xl font-bold">Tables in this Base</h1>
      <ul className="space-y-2">
        {tables.map((table) => (
          <li key={table.id}>
            <Link
              href={`/dashboard/table/${table.id}`}
              className="block rounded border p-3 hover:bg-gray-100"
            >
              {table.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
