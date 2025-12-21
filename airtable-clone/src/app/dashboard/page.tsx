// src/app/dashboard/page.tsx
"use client"

import { api } from "~/trpc/react"
import Link from "next/link"

export default function Dashboard() {
  const { data: bases, isLoading } = api.base.getUserBases.useQuery()

  if (isLoading) return <div>Loading bases…</div>
  if (!bases || bases.length === 0) return <div>No bases found.</div>

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Your Bases</h1>
      <ul className="space-y-2">
        {bases.map((base) => (
          <li key={base.id}>
            <Link
              href={`/dashboard/base/${base.id}`}
              className="block p-3 border rounded hover:bg-gray-100"
            >
              {base.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
