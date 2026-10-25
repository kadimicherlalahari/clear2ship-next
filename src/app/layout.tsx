import type { Metadata } from "next";
import Link from "next/link";
import { RoleSwitcher } from "@/components/RoleSwitcher";
import "./globals.css";

export const metadata: Metadata = {
  title: "Clear2Ship – Export Documentation & Shipment Tracker",
  description: "Catch export document mistakes early and get alerted when documents are missing or customs has an issue.",
};

const NAV = [
  { href: "/", label: "Shipments" },
  { href: "/new", label: "New booking" },
  { href: "/outbox", label: "Outbox" },
];

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <header className="bg-slate-900 text-white">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="flex flex-wrap items-center gap-6">
              <Link href="/" className="text-lg font-bold tracking-tight">
                Clear<span className="text-sky-400">2</span>Ship
              </Link>
              <nav className="flex flex-wrap gap-1 text-sm">
                {NAV.map((n) => (
                  <Link key={n.href} href={n.href} className="rounded-md px-2.5 py-1 text-slate-200 hover:bg-slate-800 hover:text-white">
                    {n.label}
                  </Link>
                ))}
              </nav>
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
