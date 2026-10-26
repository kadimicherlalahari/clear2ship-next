"use client";
import { Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

/** The floating pill bar. On phones it is one row (wordmark + Menu); the links and role switcher open below. */
export function HeaderShell({ brand, children }: { brand: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  return (
    <div className="mx-auto max-w-6xl rounded-[1.75rem] bg-white px-4 py-2.5 shadow-md ring-1 ring-slate-200/70 sm:rounded-full sm:pl-6">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex items-center justify-between gap-6 max-sm:w-full">
          {brand}
          <button type="button" aria-expanded={open} aria-controls="site-menu" onClick={() => setOpen((o) => !o)}
            className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-3.5 py-1.5 text-sm font-semibold text-white sm:hidden">
            {open ? <X className="h-4 w-4" aria-hidden /> : <Menu className="h-4 w-4" aria-hidden />} Menu
          </button>
        </div>
        <div id="site-menu" className={`${open ? "flex" : "hidden"} w-full flex-col gap-3 pb-1 sm:flex sm:w-auto sm:flex-1 sm:flex-row sm:items-center sm:justify-between sm:pb-0`}>
          {children}
        </div>
      </div>
    </div>
  );
}
