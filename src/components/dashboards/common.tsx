"use client";
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

export function Kpis({ items }: { items: { label: string; value: number | string; tone?: "red" | "amber" | "green" | "sky" }[] }) {
  const tone = { red: "text-red-700", amber: "text-amber-700", green: "text-green-700", sky: "text-sky-700" };
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {items.map((k) => (
        <div key={k.label} className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <p className={`text-2xl font-semibold tabular-nums ${k.tone ? tone[k.tone] : "text-slate-900"}`}>{k.value}</p>
          <p className="text-xs text-slate-500">{k.label}</p>
        </div>
      ))}
    </div>
  );
}

export function Tabs({ tabs, initial }: { tabs: { id: string; label: string; count?: number; content: ReactNode }[]; initial?: string }) {
  const [tab, setTab] = useState(initial ?? tabs[0].id);
  const active = tabs.find((t) => t.id === tab) ?? tabs[0];
  return (
    <div>
      <div role="tablist" className="mb-4 flex flex-wrap gap-1 border-b border-slate-200">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={t.id === active.id} onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${t.id === active.id ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
            {t.label}
            {t.count !== undefined && <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-xs ${t.id === active.id ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}>{t.count}</span>}
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
      <Link href={`/shipments/${s.id}`} className="font-semibold text-sky-700 hover:underline">{s.id}</Link>
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
  return <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">{text}</p>;
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
