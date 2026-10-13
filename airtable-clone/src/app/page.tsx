import Link from "next/link";
import { auth } from "~/server/auth";
import SignInButton from "./_components/SignInButton";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const [session, params] = await Promise.all([auth(), searchParams]);
  return (
    <main className="mx-auto grid min-h-[calc(100svh-81px)] max-w-6xl items-center gap-12 px-6 py-12 lg:grid-cols-2 lg:gap-20">
      <section>
        <p className="mb-4 text-sm font-semibold tracking-widest text-blue-600 uppercase">
          Your work, organized
        </p>
        <h1 className="max-w-lg text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
          A clear space for every idea.
        </h1>
        <p className="mt-5 max-w-lg text-lg leading-relaxed text-slate-600">
          Organize your records in flexible tables. Keep your projects together,
          edit your data, and make room for what comes next.
        </p>
        <div
          aria-hidden="true"
          className="mt-8 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
        >
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">
            Project workspace
          </div>
          <div className="grid grid-cols-2 text-sm">
            <div className="border-r border-b border-slate-200 px-4 py-3 font-medium text-slate-500">
              Task
            </div>
            <div className="border-b border-slate-200 px-4 py-3 font-medium text-slate-500">
              Hours
            </div>
            {[
              { name: "Plan the next release", hours: 4 },
              { name: "Build something useful", hours: 12 },
              { name: "Share your progress", hours: 2 },
            ].map((task) => (
              <div
                key={task.name}
                className="col-span-2 grid grid-cols-2 border-b border-slate-100 last:border-0"
              >
                <div className="border-r border-slate-100 px-4 py-3 text-slate-700">
                  {task.name}
                </div>
                <div className="px-4 py-3 text-slate-600">{task.hours}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section
        aria-labelledby="login-heading"
        className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm sm:p-10"
      >
        <h2
          id="login-heading"
          className="text-2xl font-semibold tracking-tight text-slate-900"
        >
          {session?.user ? "Welcome back" : "Sign in to your workspace"}
        </h2>
        <p className="mt-3 mb-8 text-slate-600">
          {session?.user
            ? `You're signed in as ${session.user.name ?? session.user.email ?? "a member"}. Your bases are ready in your dashboard.`
            : "Use your Google account to access your bases and tables."}
        </p>
        {params.error && (
          <p
            role="alert"
            className="mb-5 rounded-lg bg-red-50 p-3 text-sm text-red-700"
          >
            Sign-in couldn’t be completed. Please try again or use the Google
            account you originally signed in with.
          </p>
        )}
        {session?.user ? (
          <Link
            href="/dashboard"
            className="block rounded-lg bg-blue-600 px-5 py-3 text-center font-medium text-white hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            Go to dashboard
          </Link>
        ) : (
          <SignInButton />
        )}
        <p className="mt-6 text-sm leading-relaxed text-slate-500">
          Your bases belong to your account. You can sign out from the
          navigation bar on any page.
        </p>
      </section>
    </main>
  );
}
