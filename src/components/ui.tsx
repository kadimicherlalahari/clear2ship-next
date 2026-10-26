"use client";
import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

export const STATUS_STYLE: Record<string, string> = {
  Draft: "bg-slate-100 text-slate-700 ring-slate-300",
  "Docs submitted": "bg-white text-slate-700 ring-slate-300",
  "Warehouse accepted": "bg-white text-slate-700 ring-slate-300",
  Mismatch: "bg-orange-50 text-orange-800 ring-orange-300",
  "Action required": "bg-red-50 text-red-800 ring-red-300",
  "Ready for customs": "bg-teal-50 text-teal-800 ring-teal-300",
  "Declaration submitted": "bg-indigo-50 text-indigo-800 ring-indigo-300",
  Cleared: "bg-green-50 text-green-800 ring-green-300",
  "On hold": "bg-amber-50 text-amber-900 ring-amber-300",
  Rejected: "bg-red-100 text-red-900 ring-red-400",
  Delivered: "bg-green-100 text-green-900 ring-green-400",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_STYLE[status] ?? STATUS_STYLE.Draft}`}>
      {status}
    </span>
  );
}

const LEVEL_STYLE: Record<string, string> = {
  RED: "bg-red-600 text-white",
  ERROR: "bg-red-600 text-white",
  AMBER: "bg-amber-400 text-amber-950",
  WARNING: "bg-amber-400 text-amber-950",
  GREEN: "bg-green-600 text-white",
};

export function LevelBadge({ level }: { level: string }) {
  return <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-bold tracking-wide ${LEVEL_STYLE[level] ?? "bg-slate-200"}`}>{level}</span>;
}

export function Card({ title, children, actions, className = "" }: { title?: ReactNode; children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6 ${className}`}>
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="text-lg font-bold tracking-tight text-slate-900">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

/**
 * A card that folds to one line: title + a short summary, with the detail behind a click. It opens by itself when a
 * link points inside it (e.g. a "Fix it" button to #documents), so no shortcut lands on a closed section.
 */
export function Fold({ id, title, summary, tone = "plain", actions, open: forceOpen = false, children }: {
  id: string; title: ReactNode; summary?: ReactNode; tone?: "plain" | "warn"; actions?: ReactNode; open?: boolean; children: ReactNode;
}) {
  const [open, setOpen] = useState(forceOpen);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => { if (forceOpen) setOpen(true); }, [forceOpen]);
  useEffect(() => {
    const follow = () => {
      const hash = decodeURIComponent(location.hash.slice(1));
      const target = hash && document.getElementById(hash);
      if (target && ref.current?.contains(target)) {
        setOpen(true);
        requestAnimationFrame(() => target.scrollIntoView({ block: "start" }));
      }
    };
    follow();
    window.addEventListener("hashchange", follow);
    return () => window.removeEventListener("hashchange", follow);
  }, []);
  return (
    <section ref={ref} className="rounded-2xl border border-slate-200/80 bg-white shadow-sm">
      <span id={id} />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 p-5 sm:px-6">
        <button type="button" aria-expanded={open} aria-controls={`${id}-body`} onClick={() => setOpen((o) => !o)}
          className="group flex min-w-0 flex-1 items-center gap-3 text-left">
          <ChevronDown aria-hidden className={`h-5 w-5 shrink-0 text-slate-500 transition-transform duration-200 group-hover:text-slate-900 ${open ? "" : "-rotate-90"}`} />
          <span className="min-w-0">
            <span className="block text-lg font-bold tracking-tight text-slate-900">{title}</span>
            {summary && !open && <span className={`line-clamp-2 text-sm sm:line-clamp-1 ${tone === "warn" ? "text-amber-800" : "text-slate-600"}`}>{summary}</span>}
          </span>
        </button>
        {actions}
      </div>
      <div id={`${id}-body`} hidden={!open} className="px-5 pb-5 sm:px-6 sm:pb-6">{children}</div>
    </section>
  );
}

export function Button({ children, variant = "primary", className = "", ...props }:
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "accent" | "secondary" | "danger" | "ghost" }) {
  const styles = {
    primary: "bg-slate-900 text-white hover:bg-slate-800 hover:shadow-md active:translate-y-px disabled:bg-slate-300 disabled:text-slate-600 disabled:shadow-none",
    accent: "bg-sky-500 text-slate-900 hover:bg-sky-400 hover:shadow-md active:translate-y-px disabled:bg-slate-300 disabled:text-slate-600 disabled:shadow-none",
    secondary: "bg-white text-slate-900 ring-1 ring-inset ring-slate-300 hover:ring-slate-900 active:translate-y-px disabled:text-slate-400 disabled:ring-slate-200",
    danger: "bg-red-600 text-white hover:bg-red-700 active:translate-y-px disabled:bg-red-300",
    ghost: "text-slate-700 hover:bg-slate-100",
  }[variant];
  return <button {...props} className={`inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition duration-150 disabled:cursor-not-allowed ${styles} ${className}`}>{children}</button>;
}

export function ErrorNote({ text }: { text: string | null | undefined }) {
  if (!text) return null;
  return <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{text}</p>;
}

export function InfoNote({ children }: { children: ReactNode }) {
  return <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">{children}</p>;
}

export const ROLE_LABEL: Record<string, string> = {
  seller: "Seller", warehouse: "Warehouse", forwarder: "Freight forwarder", carrier: "Carrier", admin: "Admin", system: "Clear2Ship",
};

export function formatTime(iso: string | Date) {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" }).format(new Date(iso));
}

export function timeAgo(iso: string | Date) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

/** fetch JSON and throw the friendly { error } message from the API. */
export async function api<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Something went wrong (${res.status}).`);
  return data as T;
}

export const postJson = <T = unknown,>(url: string, body: unknown, method = "POST") =>
  api<T>(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
