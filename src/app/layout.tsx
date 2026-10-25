import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { NavLinks } from "@/components/NavLinks";
import { RoleSwitcher } from "@/components/RoleSwitcher";
import "./globals.css";

export const metadata: Metadata = {
  title: "Clear2Ship – Export Documentation & Shipment Tracker",
  description: "Catch export document mistakes early and get alerted when documents are missing or customs has an issue.",
};


export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // The menu depends on the role (read on the server, so it's right on the first paint).
  const role = (await cookies()).get("c2s_role")?.value ?? "seller";
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <header className="bg-slate-900 text-white">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="flex flex-wrap items-center gap-6">
              <Link href="/" className="text-lg font-bold tracking-tight">
                Clear<span className="text-sky-400">2</span>Ship
              </Link>
              <NavLinks role={role} />
            </div>
            <RoleSwitcher />
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
        <footer className="mx-auto max-w-6xl px-4 pb-8 text-xs text-slate-500">
          Clear2Ship checks paperwork before it goes to customs. It never submits customs declarations or says a shipment is compliant. A collection or delivery slot only shows as booked once the carrier or warehouse confirms it.
        </footer>
      </body>
    </html>
  );
}
