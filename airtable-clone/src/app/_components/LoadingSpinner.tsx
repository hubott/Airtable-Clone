type Props = {
  label?: string;
  fullPage?: boolean;
};

export default function LoadingSpinner({
  label = "Loading…",
  fullPage = true,
}: Props) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-center justify-center ${fullPage ? "min-h-[calc(100svh-9rem)] flex-col gap-4" : "gap-3 py-3"}`}
    >
      <span
        aria-hidden="true"
        className={`${fullPage ? "h-10 w-10 border-4" : "h-5 w-5 border-2"} animate-spin rounded-full border-blue-100 border-t-blue-600 motion-reduce:animate-none`}
      />
      <span className="text-sm font-medium text-slate-500">{label}</span>
    </div>
  );
}
