"use client";
import { usePathname, useRouter } from "next/navigation";
import { isSellerRole, SELLER_ONLY_PATHS } from "./NavLinks";
import { useEffect, useState } from "react";

export const ROLES = [
  { id: "seller", label: "Seller" },
  { id: "warehouse", label: "Warehouse" },
  { id: "forwarder", label: "Freight forwarder" },
  { id: "carrier", label: "Carrier" },
  { id: "admin", label: "Admin" },
] as const;

function readCookie(name: string) {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : "";
}
const setCookie = (name: string, value: string) => {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=31536000; samesite=lax`;
};

/** Current role (from the switcher cookie). Re-renders when the role changes. */
export function useRole() {
  const [role, setRole] = useState<string>("seller");
  useEffect(() => {
    const update = () => setRole(readCookie("c2s_role") || "seller");
    update();
    window.addEventListener("c2s-role", update);
    return () => window.removeEventListener("c2s-role", update);
  }, []);
  return role;
}

/** No login for the MVP: pick a role (and optionally a name for the timeline). */
export function RoleSwitcher() {
  const router = useRouter();
  const path = usePathname();
  const [role, setRole] = useState("seller");
  const [name, setName] = useState("");
  useEffect(() => {
    setRole(readCookie("c2s_role") || "seller");
    setName(readCookie("c2s_name"));
  }, []);

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <label htmlFor="role" className="text-slate-300">Acting as</label>
      <select
        id="role"
        value={role}
        onChange={(e) => {
          setRole(e.target.value);
          setCookie("c2s_role", e.target.value);
          window.dispatchEvent(new Event("c2s-role"));
          // Leaving a seller-only page (New booking, Outbox) when switching to another role: go to their dashboard.
          // (The menu lives in the layout, which only re-renders on refresh.)
          if (!isSellerRole(e.target.value) && SELLER_ONLY_PATHS.some((p) => path.startsWith(p))) router.push("/");
          router.refresh();
        }}
        className="rounded-md border-0 bg-slate-800 px-2 py-1 text-white ring-1 ring-slate-600 focus:ring-2 focus:ring-sky-400"
      >
        {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
      </select>
      <input
        aria-label="Your name (shown on the timeline)"
        placeholder="Your name (optional)"
        value={name}
        maxLength={60}
        onChange={(e) => { setName(e.target.value); setCookie("c2s_name", e.target.value); }}
        className="w-40 rounded-md border-0 bg-slate-800 px-2 py-1 text-white placeholder:text-slate-400 ring-1 ring-slate-600 focus:ring-2 focus:ring-sky-400"
      />
    </div>
  );
}
