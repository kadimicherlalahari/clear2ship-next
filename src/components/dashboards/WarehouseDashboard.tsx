"use client";
import { Check, X } from "lucide-react";
import { useState } from "react";
import { WarehouseScene } from "../illustrations/scenes";
import { RoleHero } from "../RoleHero";
import { postJson } from "../ui";
import {
  dayName, dmy, Empty, inputCls, kg, RowMessage, ShipmentLink, Stage, Tabs, todayIso, useRowAction, type Row,
} from "./common";
import { Button } from "../ui";

type Data = { scheduled: Row[]; pending: Row[]; history: Row[] };

/** Goods arriving at a booked slot: the warehouse accepts them or rejects them with a note. */
function Delivery({ s, run, busy, msg }: { s: Row; run: ReturnType<typeof useRowAction>["run"]; busy: string | null; msg: ReturnType<typeof useRowAction>["msg"] }) {
  const [note, setNote] = useState("");
  const received = !!s.warehouse_result;
  return (
    <li className="flex flex-wrap items-start gap-4 px-4 py-3">
      <div className="w-20 shrink-0">
        <p className="text-lg font-semibold tabular-nums">{s.appointment_time ?? "–"}</p>
        <p className="text-xs text-slate-500">{s.appointment_status === "seller_booked" ? "booked by seller" : `ref ${s.appointment_ref}`}</p>
      </div>
      <div className="min-w-[10rem] flex-1">
        <ShipmentLink s={s} />
        <p className="text-xs text-slate-600">{s.selected_carrier}{s.carrier_ref ? ` · ${s.carrier_ref}` : ""} · from {s.origin_city}, collected {dmy(s.carrier_pickup_date)}</p>
      </div>
      <div className="min-w-[10rem] text-sm">
        <p><b>{s.pallets}</b> pallets · <b>{s.cartons}</b> cartons · {kg(s.gross_weight_kg)}</p>
        <p className="text-xs text-slate-500">{s.goods}</p>
      </div>
      <div className="w-full sm:w-72">
        {received ? (
          <p className={`text-sm font-medium ${s.warehouse_result === "accepted" ? "text-green-700" : "text-red-700"}`}>
            {s.warehouse_result === "accepted" ? <><Check className="mr-1 inline h-4 w-4" aria-hidden />Received and accepted</> : <><X className="mr-1 inline h-4 w-4" aria-hidden />Rejected: {s.warehouse_note}</>}
          </p>
        ) : (
          <div className="space-y-1.5">
            <input className={`${inputCls} w-full`} placeholder="Note (needed to reject), e.g. 5 cartons missing" value={note} onChange={(e) => setNote(e.target.value)} aria-label={`Note for ${s.id}`} />
            <div className="flex gap-1.5">
              <Button disabled={busy === s.id} onClick={() => run(s.id, () => postJson(`/api/shipments/${s.id}/warehouse`, { result: "accepted", note }), "Goods accepted. The seller has been told and it moves to customs.")}>Goods OK, accept</Button>
              <Button variant="danger" disabled={busy === s.id} onClick={() => run(s.id, () => postJson(`/api/shipments/${s.id}/warehouse`, { result: "mismatch", note }), "Goods rejected. The seller has been told.")}>Reject</Button>
            </div>
          </div>
        )}
        <RowMessage id={s.id} msg={msg} />
      </div>
    </li>
  );
}

/** A slot request: accept the time, propose another, or decline. */
function Request({ s, run, busy, msg }: { s: Row; run: ReturnType<typeof useRowAction>["run"]; busy: string | null; msg: ReturnType<typeof useRowAction>["msg"] }) {
  const [date, setDate] = useState(s.expected_arrival ? dmy(s.expected_arrival) : "");
  const [time, setTime] = useState("10:00");
  const [ref, setRef] = useState("");
  const [note, setNote] = useState("");
  const post = (act: string, done: string) =>
    run(s.id, () => postJson(`/api/shipments/${s.id}/actions`, { action: "appointment-response", act, date, time, ref, note }), done);
  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-[9rem]"><ShipmentLink s={s} /></div>
        <div className="min-w-[12rem] flex-1 text-sm">
          <p><b>Expected around {dayName(s.expected_arrival)}</b></p>
          <p className="text-xs text-slate-600">{s.selected_carrier}{s.carrier_ref ? ` (${s.carrier_ref})` : ""} collects {dmy(s.carrier_pickup_date)} {s.carrier_pickup_time ?? ""} from {s.origin_city}</p>
        </div>
        <div className="text-sm">
          <p><b>{s.pallets}</b> pallets · <b>{s.cartons}</b> cartons · {kg(s.gross_weight_kg)}</p>
          <p className="text-xs text-slate-500">{s.goods}</p>
        </div>
      </div>
      {s.appointment_status === "proposed" ? (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">You proposed <b>{dmy(s.appointment_date)} at {s.appointment_time}</b> (ref {s.appointment_ref}). Waiting for the seller to accept.</p>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded-lg bg-slate-50 p-2">
          <input className={`${inputCls} w-28`} value={date} onChange={(e) => setDate(e.target.value)} placeholder="DD-MM-YYYY" aria-label="Slot date" />
          <input className={`${inputCls} w-20`} value={time} onChange={(e) => setTime(e.target.value)} placeholder="Time" aria-label="Slot time" />
          <input className={`${inputCls} w-28`} value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Slot ref" aria-label="Slot reference" />
          <input className={`${inputCls} min-w-[10rem] flex-1`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note / reason (optional)" aria-label="Note" />
          <Button disabled={busy === s.id} onClick={() => post("confirm", "Slot confirmed. The seller has been told.")}>Accept</Button>
          <Button variant="secondary" disabled={busy === s.id} onClick={() => post("propose", "New time proposed to the seller.")}>Propose this time</Button>
          <Button variant="danger" disabled={busy === s.id} onClick={() => post("decline", "Declined. The seller has been told.")}>Decline</Button>
        </div>
      )}
      <RowMessage id={s.id} msg={msg} />
    </li>
  );
}

const HISTORY_FILTERS: { id: string; label: string; test: (s: Row) => boolean }[] = [
  { id: "all", label: "All", test: () => true },
  { id: "customs", label: "Went on to customs", test: (s) => s.warehouse_result === "accepted" },
  { id: "rejected", label: "Goods rejected", test: (s) => s.warehouse_result === "mismatch" },
  { id: "declined", label: "Slot declined", test: (s) => s.appointment_status === "declined" },
  { id: "waiting", label: "Not delivered yet", test: (s) => !s.warehouse_result },
];

function slotText(s: Row) {
  switch (s.appointment_status) {
    case "confirmed": return `${dmy(s.appointment_date)} ${s.appointment_time}`;
    case "seller_booked": return "Booked by seller";
    case "requested": return "Requested";
    case "proposed": return `Proposed ${dmy(s.appointment_date)} ${s.appointment_time}`;
    case "declined": return `Declined: ${s.appointment_note ?? ""}`;
    default: return "Not requested yet";
  }
}

export function WarehouseDashboard({ data: all }: { data: Data }) {
  const { busy, msg, run } = useRowAction();
  const [filter, setFilter] = useState("all");
  // Narrow everything below the banner to one seller.
  const [seller, setSeller] = useState("");
  const sellers = [...new Set([...all.scheduled, ...all.pending, ...all.history].map((s) => s.seller_name).filter(Boolean))].sort() as string[];
  const bySeller = (rows: Row[]) => (seller ? rows.filter((s) => s.seller_name === seller) : rows);
  const data: Data = { scheduled: bySeller(all.scheduled), pending: bySeller(all.pending), history: bySeller(all.history) };
  const today = todayIso();
  const notReceived = data.scheduled.filter((s) => !s.warehouse_result);
  const weekEnd = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  const day = (s: Row) => (s.appointment_date ? String(s.appointment_date).slice(0, 10) : "");

  // Group scheduled deliveries: overdue, today, then each upcoming day.
  const groups = new Map<string, Row[]>();
  for (const s of data.scheduled) {
    const d = day(s);
    const key = !d ? "No time given" : d < today && !s.warehouse_result ? "Overdue: not received yet" : d === today ? "Today" : d < today ? "Earlier" : dayName(d);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(s);
  }
  const week = Array.from({ length: 7 }, (_, i) => new Date(Date.now() + i * 864e5).toISOString().slice(0, 10));
  const filtered = data.history.filter(HISTORY_FILTERS.find((f) => f.id === filter)!.test);

  return (
    <div className="space-y-5">
      <RoleHero
        lead="Every dock,"
        accent="on time."
        sentence="Slot requests to answer, today's deliveries to check, and what happened to every delivery, for all sellers."
        note="dock's open!"
        noteAt="bottom-left"
        scene={<WarehouseScene className="h-auto w-full" />}
        stats={[
          { label: "Arriving today", value: notReceived.filter((s) => day(s) === today).length },
          { label: "Next 7 days", value: data.scheduled.filter((s) => day(s) >= today && day(s) <= weekEnd).length },
          { label: "Slot requests to answer", value: data.pending.filter((s) => s.appointment_status === "requested").length, tone: "orange" },
          { label: "Waiting for seller", value: data.pending.filter((s) => s.appointment_status === "proposed").length },
          { label: "Goods rejected, open", value: data.history.filter((s) => s.warehouse_result === "mismatch" && s.status === "Mismatch").length, tone: "red" },
        ]}
      />

      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="wh-seller" className="text-sm font-semibold text-slate-900">Seller</label>
        <select id="wh-seller" value={seller} onChange={(e) => setSeller(e.target.value)}
          className="rounded-full border border-slate-300 bg-white px-3.5 py-1.5 text-sm font-medium focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500">
          <option value="">All sellers ({sellers.length})</option>
          {sellers.map((n) => <option key={n}>{n}</option>)}
        </select>
        {seller && <button type="button" onClick={() => setSeller("")} className="text-sm font-semibold text-slate-900 decoration-sky-500 decoration-2 underline-offset-4 hover:underline">Show all</button>}
      </div>

      <div className="grid grid-cols-7 gap-1.5" aria-label="Deliveries in the next 7 days">
        {week.map((d) => {
          const list = data.scheduled.filter((s) => day(s) === d);
          const pallets = list.reduce((t, s) => t + Number(s.pallets ?? 0), 0);
          return (
            <div key={d} className={`rounded-lg border px-2 py-1.5 text-center ${d === today ? "border-sky-400 bg-sky-50" : "border-slate-200 bg-white"}`}>
              <p className="text-[11px] text-slate-500">{dayName(d)}</p>
              <p className="text-sm font-semibold">{list.length} <span className="text-xs font-normal text-slate-500">deliv.</span></p>
              <p className="text-[11px] text-slate-500">{pallets} pallets</p>
            </div>
          );
        })}
      </div>

      <Tabs tabs={[
        {
          id: "scheduled", label: "Scheduled deliveries", count: data.scheduled.length,
          content: data.scheduled.length ? (
            <div className="space-y-4">
              {[...groups.entries()].map(([label, rows]) => (
                <section key={label}>
                  <h3 className={`mb-1.5 text-xs font-semibold uppercase tracking-wide ${label.startsWith("Overdue") ? "text-red-700" : "text-slate-500"}`}>{label}</h3>
                  <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
                    {rows.map((s) => <Delivery key={s.id} s={s} run={run} busy={busy} msg={msg} />)}
                  </ul>
                </section>
              ))}
            </div>
          ) : <Empty text="No deliveries booked yet." />,
        },
        {
          id: "pending", label: "Slot requests", count: data.pending.length,
          content: data.pending.length ? (
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
              {data.pending.map((s) => <Request key={s.id} s={s} run={run} busy={busy} msg={msg} />)}
            </ul>
          ) : <Empty text="No slot requests waiting. New requests arrive here once a carrier confirms a collection." />,
        },
        {
          id: "history", label: "History", count: data.history.length,
          content: (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {HISTORY_FILTERS.map((f) => (
                  <button key={f.id} onClick={() => setFilter(f.id)} aria-pressed={filter === f.id}
                    className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${filter === f.id ? "bg-slate-900 text-white ring-slate-900" : "bg-white ring-slate-300 hover:bg-slate-100"}`}>
                    {f.label} ({data.history.filter(f.test).length})
                  </button>
                ))}
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                <table className="w-full min-w-[860px] text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr><th className="px-3 py-2">Shipment</th><th className="px-3 py-2">Delivery slot</th><th className="px-3 py-2">Goods</th><th className="px-3 py-2">Where it is now</th><th className="px-3 py-2">Seller told</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filtered.map((s) => (
                      <tr key={s.id} className="align-top">
                        <td className="px-3 py-2.5"><ShipmentLink s={s} /></td>
                        <td className="px-3 py-2.5">{slotText(s)}</td>
                        <td className="px-3 py-2.5">
                          {s.warehouse_result === "accepted" ? <span className="text-green-700"><Check className="mr-1 inline h-4 w-4" aria-hidden />Accepted {dmy(s.goods_received_at)}</span>
                            : s.warehouse_result === "mismatch" ? <span className="text-red-700"><X className="mr-1 inline h-4 w-4" aria-hidden />Rejected: {s.warehouse_note}</span>
                            : <span className="text-slate-500">Not received</span>}
                        </td>
                        <td className="px-3 py-2.5"><Stage s={s} /></td>
                        <td className="px-3 py-2.5 text-xs text-slate-600">{s.seller_told ? <>{s.seller_told.subject}<br />{dmy(s.seller_told.sent_at)}{s.seller_told.provider_id ? "" : " (Outbox)"}</> : "–"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ),
        },
      ]} />
    </div>
  );
}
