// src/app/dashboard/page.tsx
"use client";

import { useRouter } from "next/navigation";
import CreateResourceForm from "~/app/_components/CreateResourceForm";
import ResourceCard from "~/app/_components/ResourceCard";
import LoadingSpinner from "~/app/_components/LoadingSpinner";
import { api } from "~/trpc/react";

export default function Dashboard() {
  const router = useRouter();
  const utils = api.useUtils();
  const { mutateAsync: createBase } = api.base.createBase.useMutation();
  const { data: bases, isLoading, error } = api.base.getUserBases.useQuery();

  if (isLoading) return <LoadingSpinner label="Loading your bases…" />;
  if (error)
    return (
      <p
        role="alert"
        className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800"
      >
        {error.message}
      </p>
    );

  return (
    <div className="min-w-0">
      <div className="mb-6">
        <p className="mb-2 text-xs font-semibold tracking-widest text-blue-600 uppercase">
          Workspace
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Your bases</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Keep related tables together in a base. Choose a workspace or create a
          new one.
        </p>
      </div>
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
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <h2 className="text-lg font-semibold">
            Your first workspace starts here
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
            Create a base above, then add tables for your projects, tasks or
            ideas.
          </p>
        </div>
      )}
      {!!bases?.length && (
        <h2 className="mb-3 text-sm font-medium text-slate-600">
          {bases.length} {bases.length === 1 ? "base" : "bases"}
        </h2>
      )}
      <ul
        aria-label="Your bases"
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {bases?.map((base) => (
          <ResourceCard
            key={base.id}
            resource="base"
            id={base.id}
            name={base.name}
          />
        ))}
      </ul>
    </div>
  );
}
