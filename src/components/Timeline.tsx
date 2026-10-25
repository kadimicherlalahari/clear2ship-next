"use client";
import { useMemo, useState } from "react";
import { formatTime, ROLE_LABEL, STATUS_STYLE, timeAgo } from "./ui";

type Event = { id: number; actor_role: string; actor_name: string | null; action: string; created_at: string };

const ROLE_STYLE: Record<string, { dot: string; chip: string; icon: string }> = {
  seller: { dot: "bg-sky-600", chip: "bg-sky-50 text-sky-800 ring-sky-200", icon: "S" },
  warehouse: { dot: "bg-violet-600", chip: "bg-violet-50 text-violet-800 ring-violet-200", icon: "W" },
  forwarder: { dot: "bg-indigo-600", chip: "bg-indigo-50 text-indigo-800 ring-indigo-200", icon: "F" },
  carrier: { dot: "bg-teal-600", chip: "bg-teal-50 text-teal-800 ring-teal-200", icon: "C" },
  admin: { dot: "bg-slate-800", chip: "bg-slate-100 text-slate-800 ring-slate-300", icon: "A" },
  system: { dot: "bg-slate-400", chip: "bg-slate-50 text-slate-600 ring-slate-200", icon: "⚙" },
};

const dayLabel = (iso: string) => {
  const d = new Date(iso);
  const fmt = (x: Date) => new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "Europe/London" }).format(x);
  const today = new Date();
  const yesterday = new Date(Date.now() - 864e5);
  if (fmt(d) === fmt(today)) return "Today";
  if (fmt(d) === fmt(yesterday)) return "Yesterday";
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/London" }).format(d);
};

/** Split "Edited the booking: Pallets: 3 → 4; Cartons: 90 → 88" into a title and a list of details. */
function split(action: string): { title: string; details: string[]; status?: string } {
  const st = action.match(/^Status changed from (.+) to (.+)$/);
  if (st) return { title: `Status changed from ${st[1]}`, details: [], status: st[2] };
  const i = action.indexOf(": ");
  if (i > 0) {
    const rest = action.slice(i + 2);
    const parts = rest.split(/;\s|\s\|\s/).filter(Boolean);
    if (parts.length > 1) return { title: action.slice(0, i), details: parts };
  }
  return { title: action, details: [] };
}

export function Timeline({ events }: { events: Event[] }) {
  const [roles, setRoles] = useState<Set<string>>(new Set());
  const [showSystem, setShowSystem] = useState(true);
  const [limit, setLimit] = useState(20);
  const [openId, setOpenId] = useState<number | null>(null);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of events) m.set(e.actor_role, (m.get(e.actor_role) ?? 0) + 1);
    return m;
  }, [events]);
  const filtered = events.filter((e) => (roles.size === 0 || roles.has(e.actor_role)) && (showSystem || e.actor_role !== "system"));
  const shown = filtered.slice(0, limit);
  const groups: { day: string; items: Event[] }[] = [];
  for (const e of shown) {
    const day = dayLabel(e.created_at);
    if (groups.at(-1)?.day !== day) groups.push({ day, items: [] });
    groups.at(-1)!.items.push(e);
  }
  const toggle = (r: string) => setRoles((prev) => {
    const next = new Set(prev);
    if (next.has(r)) next.delete(r); else next.add(r);
    return next;
  });

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Timeline <span className="text-sm font-normal text-slate-500">· {events.length} updates</span></h2>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by who made the change">
          {[...counts.keys()].filter((r) => r !== "system").map((r) => (
            <button key={r} onClick={() => toggle(r)} aria-pressed={roles.has(r)}
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset transition ${roles.has(r) ? `${ROLE_STYLE[r]?.chip} ring-2` : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"}`}>
              {ROLE_LABEL[r] ?? r} ({counts.get(r)})
            </button>
          ))}
          <label className="ml-2 flex items-center gap-1.5 text-xs text-slate-600">
            <input type="checkbox" className="accent-slate-700" checked={showSystem} onChange={(e) => setShowSystem(e.target.checked)} />
            Automatic updates
          </label>
        </div>
      </div>

      {groups.length === 0 && <p className="text-sm text-slate-500">Nothing to show for this filter.</p>}
      <div className="space-y-5">
        {groups.map((g) => (
          <div key={g.day}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{g.day}</p>
            <ol className="relative space-y-1 before:absolute before:bottom-2 before:left-[15px] before:top-2 before:w-px before:bg-slate-200">
              {g.items.map((e) => {
                const st = ROLE_STYLE[e.actor_role] ?? ROLE_STYLE.system;
                const { title, details, status } = split(e.action);
                const open = openId === e.id;
                const expandable = details.length > 0;
                return (
                  <li key={e.id} className="relative flex gap-3">
                    <span className={`z-10 mt-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ring-4 ring-white ${st.dot}`} aria-hidden>{st.icon}</span>
                    <div className={`min-w-0 flex-1 rounded-lg px-3 py-2 ${expandable ? "cursor-pointer hover:bg-slate-50" : ""} ${e.actor_role === "system" ? "" : "bg-slate-50/60"}`}
                      onClick={() => expandable && setOpenId(open ? null : e.id)}>
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className={`text-sm ${e.actor_role === "system" ? "text-slate-600" : "font-medium text-slate-900"}`}>
                          {title}
                          {status && <span className={`ml-2 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_STYLE[status] ?? ""}`}>{status}</span>}
                          {expandable && <span className="ml-1.5 text-xs text-sky-700">{open ? "▾ hide" : `▸ ${details.length} details`}</span>}
                        </p>
                        <time className="text-xs text-slate-500" dateTime={e.created_at} title={formatTime(e.created_at)}>{timeAgo(e.created_at)}</time>
                      </div>
                      <p className="text-xs text-slate-500">
                        <span className={`mr-1 inline-flex rounded px-1.5 py-px font-medium ring-1 ring-inset ${st.chip}`}>{ROLE_LABEL[e.actor_role] ?? e.actor_role}</span>
                        {e.actor_name && <span className="mr-1">{e.actor_name}</span>}· {formatTime(e.created_at)}
                      </p>
                      {open && (
                        <ul className="mt-2 space-y-0.5 border-l-2 border-slate-200 pl-3 text-sm text-slate-700">
                          {details.map((d, i) => <li key={i}>{d}</li>)}
                        </ul>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
      </div>
      {filtered.length > limit && (
        <button className="mt-4 text-sm font-medium text-sky-700 hover:underline" onClick={() => setLimit((l) => l + 30)}>
          Show older updates ({filtered.length - limit} more)
        </button>
      )}
    </section>
  );
}
