// src/app/dashboard/page.tsx
"use client";

import { useRouter } from "next/navigation";
import CreateResourceForm from "~/app/_components/CreateResourceForm";
import DeleteResourceButton from "~/app/_components/DeleteResourceButton";
import ResourceNameEditor from "~/app/_components/ResourceNameEditor";
import LoadingSpinner from "~/app/_components/LoadingSpinner";
import { api } from "~/trpc/react";
import Link from "next/link";

export default function Dashboard() {
  const router = useRouter();
  const utils = api.useUtils();
  const { mutateAsync: createBase } = api.base.createBase.useMutation();
  const { data: bases, isLoading, error } = api.base.getUserBases.useQuery();

  if (isLoading) return <LoadingSpinner label="Loading your bases…" />;
  if (error) return <p role="alert">{error.message}</p>;

  return (
    <div className="p-4">
      <h1 className="mb-4 text-2xl font-bold">Your Bases</h1>
      <CreateResourceForm
        resource="base"
        onCreate={async (name) => {
          await utils.base.getUserBases.cancel();
          const base = await createBase({ name });
          utils.base.getUserBases.setData(undefined, (existing) => [
            { id: base.id, name: base.name, createdAt: base.createdAt },
            ...(existing ?? []),
          ]);
          router.push(`/dashboard/base/${base.id}`);
        }}
      />
      {!bases?.length && (
        <p className="text-slate-600">
          No bases yet. Create your first base to organize your tables.
        </p>
      )}
      <ul className="space-y-2">
        {bases?.map((base) => (
          <li
            key={base.id}
            className="flex flex-wrap items-center gap-2 rounded border bg-white p-2"
          >
            <Link
              href={`/dashboard/base/${base.id}`}
              className="min-w-0 flex-1 rounded p-2 hover:bg-gray-100"
              title={base.name}
            >
              <span className="block truncate">{base.name}</span>
            </Link>
            <ResourceNameEditor resource="base" id={base.id} name={base.name} />
            <DeleteResourceButton
              resource="base"
              id={base.id}
              name={base.name}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
