import "~/styles/globals.css";

import { type Metadata } from "next";
import { Geist } from "next/font/google";

import AppHeader from "~/app/_components/AppHeader";
import { TRPCReactProvider } from "~/trpc/react";

export const metadata: Metadata = {
  title: "Airtable Clone",
  description:
    "Organize your projects with editable tables and flexible workspaces.",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geist.variable}`}>
      <body className="bg-slate-50 font-sans text-slate-900">
        <TRPCReactProvider>
          <AppHeader />
          {children}
        </TRPCReactProvider>
      </body>
    </html>
  );
}
