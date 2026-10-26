import type { Metadata } from "next";
import { Archivo, Caveat } from "next/font/google";
import { cookies } from "next/headers";
import Link from "next/link";
import { HeaderShell } from "@/components/HeaderShell";
import { NavLinks } from "@/components/NavLinks";
import { RoleSwitcher } from "@/components/RoleSwitcher";
import { unreadCount } from "@/lib/alerts";
import "./globals.css";

// Archivo carries everything (its wide, heavy cut for titles); Caveat is only for handwritten notes.
const archivo = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-archivo", display: "swap" });
const caveat = Caveat({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-caveat", display: "swap" });

export const metadata: Metadata = {
  title: "Clear2Ship – Export Documentation & Shipment Tracker",
  description: "Catch export document mistakes early and get alerted when documents are missing or customs has an issue.",
};


export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // The menu depends on the role (read on the server, so it's right on the first paint).
  const role = (await cookies()).get("c2s_role")?.value ?? "seller";
  const unread = role === "seller" || role === "admin" ? await unreadCount().catch(() => 0) : 0;
  return (
    <html lang="en" className={`${archivo.variable} ${caveat.variable}`}>
      <body className="min-h-screen bg-[var(--color-depot)] text-slate-900 antialiased">
        <header className="sticky top-0 z-40 px-3 pt-3 sm:px-4">
          <HeaderShell
            brand={
              <Link href="/" aria-label="Clear2Ship home" className="text-xl font-extrabold tracking-tight [font-stretch:115%]">
                clear2ship<span className="text-sky-500">.</span>
              </Link>
            }
          >
            <NavLinks role={role} unread={unread} />
            <RoleSwitcher />
          </HeaderShell>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8">{children}</main>
        <footer className="mx-auto max-w-6xl px-4 pb-10">
          <div className="flex flex-wrap items-start justify-between gap-4 border-t border-slate-200 pt-6 text-xs text-slate-500">
            <p className="text-base font-extrabold text-slate-900 [font-stretch:115%]">clear2ship<span className="text-sky-500">.</span></p>
            <p className="max-w-xl">
              Clear2Ship checks paperwork before it goes to customs. It never submits customs declarations or says a shipment is compliant.
              A collection or delivery slot only shows as booked once the carrier or warehouse confirms it.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
