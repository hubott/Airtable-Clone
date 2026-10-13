import Link from "next/link";
import { auth } from "~/server/auth";
import SignOutButton from "./SignOutButton";

export default async function AppHeader() {
  const session = await auth();
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2 font-semibold tracking-tight text-slate-900"
        >
          <span
            aria-hidden="true"
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white"
          >
            A
          </span>
          Airtable Clone
        </Link>
        <nav aria-label="Main navigation" className="flex items-center gap-4">
          {session?.user ? (
            <>
              <Link
                href="/dashboard"
                className="text-sm font-medium text-slate-700 hover:text-blue-600"
              >
                Dashboard
              </Link>
              <span className="hidden max-w-48 truncate text-sm text-slate-500 sm:block">
                {session.user.name ?? session.user.email ?? "Your account"}
              </span>
              <SignOutButton />
            </>
          ) : (
            <Link
              href="/"
              className="text-sm font-medium text-blue-600 hover:text-blue-800"
            >
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
