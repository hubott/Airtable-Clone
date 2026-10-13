import { redirect } from "next/navigation";
import { auth } from "~/server/auth";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/");
  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</main>
  );
}
