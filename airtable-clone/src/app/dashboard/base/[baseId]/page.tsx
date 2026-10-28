// src/app/dashboard/base/[baseId]/page.tsx
"use client";

import ResourceCard from "~/app/_components/ResourceCard";
import CreateResourceForm from "~/app/_components/CreateResourceForm";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import DeleteResourceButton from "~/app/_components/DeleteResourceButton";
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
    <div className="min-w-0">
      <Link
        href="/dashboard"
        className="mb-5 inline-block rounded text-sm font-medium text-slate-600 hover:text-blue-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
      >
        ← Back to dashboard
      </Link>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h1
          className="max-w-full min-w-0 truncate text-3xl font-semibold tracking-tight"
          title={base.name}
        >
          {base.name}
        </h1>
        <ResourceNameEditor resource="base" id={base.id} name={base.name} />
        <DeleteResourceButton resource="base" id={base.id} name={base.name} />
      </div>
      <p className="mb-6 text-sm leading-6 text-slate-600">
        Organize this workspace with tables. Open one to edit, search and
        arrange your records.
      </p>
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
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <h2 className="text-lg font-semibold">Make room for your records</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
            Create a table above. It starts with a Name column and a blank row,
            ready for your first entry.
          </p>
        </div>
      )}
      {!!tables?.length && (
        <h2 className="mb-3 text-sm font-medium text-slate-600">
          {tables.length} {tables.length === 1 ? "table" : "tables"}
        </h2>
      )}
      <ul
        aria-label="Tables in this base"
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {tables?.map((table) => (
          <ResourceCard
            key={table.id}
            resource="table"
            id={table.id}
            name={table.name}
          />
        ))}
      </ul>
    </div>
  );
}
