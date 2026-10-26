"use client";
import { PackageOpen } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { StatusBadge } from "../ui";

export type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export const dmy = (v: unknown) => (v ? (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10).split("-").reverse().join("-") : "–");
export const dayName = (v: unknown) => {
  if (!v) return "–";
  const d = new Date(`${String(v).slice(0, 10)}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(d);
};
export const todayIso = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
export const kg = (v: unknown) => (v == null ? "–" : `${Number(v).toLocaleString("en-GB", { maximumFractionDigits: 1 })} kg`);
export const daysSince = (v: unknown) => (v ? Math.max(0, Math.floor((Date.now() - new Date(String(v)).getTime()) / 864e5)) : 0);

export function Tabs({ tabs, initial }: { tabs: { id: string; label: string; count?: number; content: ReactNode }[]; initial?: string }) {
  const [tab, setTab] = useState(initial ?? tabs[0].id);
  const active = tabs.find((t) => t.id === tab) ?? tabs[0];
  return (
    <div>
      <div role="tablist" className="mb-4 inline-flex max-w-full flex-wrap gap-1 rounded-[1.4rem] bg-white p-1 shadow-sm ring-1 ring-slate-200/80">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={t.id === active.id} onClick={() => setTab(t.id)}
            className={`inline-flex items-center rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${t.id === active.id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`}>
            {t.label}
            {t.count !== undefined && <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-xs tabular-nums ${t.id === active.id ? "bg-sky-500 text-slate-900" : "bg-slate-100 text-slate-600"}`}>{t.count}</span>}
          </button>
        ))}
      </div>
      {active.content}
    </div>
  );
}

export function ShipmentLink({ s }: { s: Row }) {
  return (
    <div>
      <Link href={`/shipments/${s.id}`} className="font-semibold text-slate-900 decoration-sky-500 decoration-2 underline-offset-4 hover:underline focus-visible:underline">{s.id}</Link>
      <p className="text-xs text-slate-500">{s.seller_name}</p>
    </div>
  );
}

export function Stage({ s }: { s: Row }) {
  return (
    <StatusBadge status={s.status} />
  );
}

export function Empty({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
      <PackageOpen className="h-8 w-8 text-slate-300" aria-hidden />
      <p>{text}</p>
      <p className="hand text-xl text-sky-700">all quiet on the dock</p>
    </div>
  );
}

/** Run an API action from a dashboard row, then refresh the page data. */
export function useRowAction() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ id: string; text: string; ok: boolean } | null>(null);
  const run = async (id: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(id); setMsg(null);
    try { await fn(); setMsg({ id, text: done, ok: true }); router.refresh(); }
    catch (e) { setMsg({ id, text: (e as Error).message, ok: false }); }
    finally { setBusy(null); }
  };
  return { busy, msg, run };
}

export function RowMessage({ id, msg }: { id: string; msg: { id: string; text: string; ok: boolean } | null }) {
  if (!msg || msg.id !== id) return null;
  return <p role={msg.ok ? "status" : "alert"} className={`mt-1 text-xs font-medium ${msg.ok ? "text-green-700" : "text-red-700"}`}>{msg.text}</p>;
}

export const inputCls = "rounded-md border border-slate-300 bg-white px-2 py-1 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500";
