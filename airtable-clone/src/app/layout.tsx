import "~/styles/globals.css";

import { type Metadata } from "next";
import { Geist } from "next/font/google";

import AppHeader from "~/app/_components/AppHeader";
import { TRPCReactProvider } from "~/trpc/react";

const metadataOrigin =
  process.env.AUTH_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(metadataOrigin),
  title: "Airtable Clone",
  description:
    "Organize your projects with editable tables and flexible workspaces.",
  applicationName: "Airtable Clone",
  openGraph: {
    type: "website",
    title: "Airtable Clone",
    description:
      "Organize records in flexible tables with spreadsheet editing, search, filtering and sorting.",
    siteName: "Airtable Clone",
    locale: "en_AU",
  },
  twitter: {
    card: "summary_large_image",
    title: "Airtable Clone",
    description:
      "Private workspaces. Flexible tables. Fast spreadsheet editing.",
  },
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
