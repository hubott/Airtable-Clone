import Link from "next/link";
import DeleteResourceButton from "./DeleteResourceButton";
import ResourceNameEditor from "./ResourceNameEditor";

export default function ResourceCard({
  resource,
  id,
  name,
}: {
  resource: "base" | "table";
  id: string;
  name: string;
}) {
  return (
    <li className="flex min-w-0 flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
      <Link
        href={`/dashboard/${resource}/${id}`}
        title={name}
        className="group flex min-w-0 flex-1 items-center gap-3 rounded-t-xl p-5 transition-colors hover:bg-blue-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600"
      >
        <span
          aria-hidden="true"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600"
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="3" width="18" height="18" rx="3" />
            <path
              d={
                resource === "base"
                  ? "M3 10h18M10 10v11"
                  : "M3 9h18M3 15h18M10 3v18"
              }
            />
          </svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold text-slate-900 group-hover:text-blue-700">
            {name}
          </span>
          <span className="mt-1 block text-sm text-slate-500">
            {resource === "base" ? "Open workspace" : "Open table"}
          </span>
        </span>
        <span
          aria-hidden="true"
          className="text-slate-400 group-hover:text-blue-600"
        >
          →
        </span>
      </Link>
      <div
        role="group"
        aria-label={`Manage ${resource} ${name}`}
        className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-5 py-3"
      >
        <ResourceNameEditor resource={resource} id={id} name={name} />
        <DeleteResourceButton resource={resource} id={id} name={name} />
      </div>
    </li>
  );
}
