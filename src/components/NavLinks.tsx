"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

/** Sellers (and admin) work across many pages; the other roles each have one dashboard with tabs. */
const NAV: Record<string, { href: string; label: string }[]> = {
  seller: [
    { href: "/", label: "Shipments" },
    { href: "/new", label: "New booking" },
    { href: "/alerts", label: "Alerts" },
  ],
  admin: [
    { href: "/", label: "Shipments" },
    { href: "/new", label: "New booking" },
    { href: "/alerts", label: "Alerts" },
    { href: "/outbox", label: "Email log" },
  ],
  warehouse: [{ href: "/", label: "Warehouse dashboard" }],
  forwarder: [{ href: "/", label: "Customs dashboard" }],
  carrier: [{ href: "/", label: "Collections dashboard" }],
};

export const SELLER_ONLY_PATHS = ["/new", "/outbox", "/alerts"];
export const isSellerRole = (role: string) => role === "seller" || role === "admin";

export function NavLinks({ role, unread = 0 }: { role: string; unread?: number }) {
  const path = usePathname();
  const links = NAV[role] ?? NAV.seller;
  return (
    <nav className="flex flex-wrap gap-1 text-sm">
      {links.map((n) => {
        const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
        return (
          <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined}
            className={`rounded-md px-2.5 py-1 hover:bg-slate-800 hover:text-white ${active ? "bg-slate-800 text-white" : "text-slate-200"}`}>
            {n.label}
            {n.href === "/alerts" && unread > 0 && (
              <span className="ml-1.5 rounded-full bg-red-500 px-1.5 py-0.5 text-[11px] font-bold text-white" aria-label={`${unread} unread`}>{unread}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
