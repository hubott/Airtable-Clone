"use client";

import { useId, useState, type ReactNode } from "react";

export default function InfoTooltip({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <div
      className="relative inline-flex shrink-0"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={label}
        aria-describedby={open ? id : undefined}
        className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 text-xs font-semibold text-slate-500 hover:border-blue-400 hover:text-blue-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false);
            event.stopPropagation();
          }
        }}
      >
        <span aria-hidden="true">i</span>
      </button>
      {open && (
        <div className="absolute top-full left-0 z-50 w-72 max-w-[calc(100vw-2rem)] pt-2">
          <div
            id={id}
            role="tooltip"
            className="space-y-2 rounded-lg bg-slate-800 p-4 text-sm leading-relaxed font-normal text-white shadow-lg"
          >
            {children}
          </div>
        </div>
      )}
    </div>
  );
}
