// src/app/dashboard/base/[baseId]/page.tsx
"use client";

import CreateResourceForm from "~/app/_components/CreateResourceForm";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import ResourceNameEditor from "~/app/_components/ResourceNameEditor";
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
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="min-w-0 truncate text-2xl font-bold" title={base.name}>
          {base.name}
        </h1>
        <ResourceNameEditor resource="base" id={base.id} name={base.name} />
      </div>
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
          <li
            key={table.id}
            className="flex flex-wrap items-center gap-2 rounded border bg-white p-2"
          >
            <Link
              href={`/dashboard/table/${table.id}`}
              className="min-w-0 flex-1 rounded p-2 hover:bg-gray-100"
              title={table.name}
            >
              <span className="block truncate">{table.name}</span>
            </Link>
            <ResourceNameEditor
              resource="table"
              id={table.id}
              name={table.name}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
