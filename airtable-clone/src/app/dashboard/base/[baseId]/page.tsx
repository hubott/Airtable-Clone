// src/app/dashboard/base/[baseId]/page.tsx
"use client";

import CreateResourceForm from "~/app/_components/CreateResourceForm";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import LoadingSpinner from "~/app/_components/LoadingSpinner";
import { api } from "~/trpc/react";

export default function BasePage() {
  const params = useParams();
  const baseId = params.baseId as string;
  const router = useRouter();
  const utils = api.useUtils();
  const { mutateAsync: createTable } = api.table.createTable.useMutation();
  const {
    data: base,
    isLoading: baseLoading,
    error: baseError,
  } = api.base.getBase.useQuery({ baseId }, { enabled: !!baseId });

  const {
    data: tables,
    isLoading,
    error,
  } = api.table.getTablesByBase.useQuery(
    {
      baseId,
    },
    { enabled: !!baseId },
  );

  if (isLoading || baseLoading)
    return <LoadingSpinner label="Loading tables…" />;
  if (error || baseError)
    return <p role="alert">{baseError?.message ?? error?.message}</p>;
  if (!base) return <p>No base selected.</p>;

  return (
    <div className="p-4">
      <Link
        href="/dashboard"
        className="mb-3 inline-block text-sm text-slate-600 hover:text-blue-600"
      >
        ← Back to dashboard
      </Link>
      <h1 className="mb-4 text-2xl font-bold">{base.name}</h1>
      <CreateResourceForm
        resource="table"
        onCreate={async (name) => {
          await utils.table.getTablesByBase.cancel({ baseId });
          const table = await createTable({ baseId, name });
          utils.table.getTablesByBase.setData({ baseId }, (existing) => [
            ...(existing ?? []),
            table,
          ]);
          router.push(`/dashboard/table/${table.id}`);
        }}
      />
      {!tables?.length && (
        <p className="text-slate-600">
          No tables yet. Create a table to start entering data.
        </p>
      )}
      <ul className="space-y-2">
        {tables?.map((table) => (
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
