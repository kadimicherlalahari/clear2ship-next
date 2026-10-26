"use client";
import { useState } from "react";
import { CarrierScene } from "../illustrations/scenes";
import { RoleHero } from "../RoleHero";
import { Button, postJson, StatusBadge } from "../ui";
import { dayName, dmy, Empty, inputCls, kg, RowMessage, ShipmentLink, Tabs, useRowAction, type Row } from "./common";

type Data = { requests: Row[]; scheduled: Row[]; history: Row[] };
const CARRIER_NAMES = ["Carrier A", "Carrier B", "Carrier C"];

function Request({ s, r }: { s: Row; r: ReturnType<typeof useRowAction> }) {
  const [date, setDate] = useState(dmy(s.collection_date));
  const [time, setTime] = useState("");
  const [ref, setRef] = useState("");
  const [note, setNote] = useState("");
  const post = (act: string, done: string) =>
    r.run(s.id, () => postJson(`/api/shipments/${s.id}/actions`, { action: "carrier-response", act, pickup_date: date, pickup_time: time, ref, note }), done);
  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-[9rem]"><ShipmentLink s={s} /><p className="text-xs font-medium text-slate-700">{s.selected_carrier}</p></div>
        <div className="min-w-[12rem] flex-1 text-sm">
          <p><b>Collect {dayName(s.collection_date)}</b>, {s.collection_window}</p>
          <p className="text-xs text-slate-600">{s.origin_city}, UK → {s.destination_city}, {s.destination_country} ({s.destination_type})</p>
        </div>
        <div className="text-sm"><p><b>{s.pallets}</b> pallets · <b>{s.cartons}</b> cartons · {kg(s.gross_weight_kg)}</p><p className="text-xs text-slate-500">{s.goods}</p></div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded-lg bg-slate-50 p-2">
        <input className={`${inputCls} w-28`} value={date} onChange={(e) => setDate(e.target.value)} placeholder="DD-MM-YYYY" aria-label="Collection date" />
        <input className={`${inputCls} w-20`} value={time} onChange={(e) => setTime(e.target.value)} placeholder="Time" aria-label="Collection time" />
        <input className={`${inputCls} w-28`} value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Booking ref" aria-label="Booking reference" />
        <Button disabled={r.busy === s.id} onClick={() => post("confirm", "Collection confirmed. The warehouse has been asked for a slot where needed.")}>Confirm</Button>
        <input className={`${inputCls} min-w-[10rem] flex-1`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason, if declining" aria-label="Reason for declining" />
        <Button variant="danger" disabled={r.busy === s.id} onClick={() => post("decline", "Declined. The seller has been told.")}>Decline</Button>
      </div>
      <RowMessage id={s.id} msg={r.msg} />
    </li>
  );
}

export function CarrierDashboard({ data }: { data: Data }) {
  const r = useRowAction();
  const [carrier, setCarrier] = useState("All");
  const mine = (rows: Row[]) => rows.filter((s) => carrier === "All" || s.selected_carrier === carrier || (s.carrier_note ?? "").startsWith(carrier));
  return (
    <div className="space-y-5">
      <RoleHero
        lead="Pick up. Move."
        accent="Deliver."
        sentence="Collection requests from sellers to confirm or decline, and the collections you've booked."
        note="on the road!"
        noteAt="bottom-left"
        scene={<CarrierScene className="h-auto w-full" />}
        stats={[
          { label: "Requests to answer", value: mine(data.requests).length, tone: "orange" },
          { label: "Collections booked", value: mine(data.scheduled).length },
          { label: "Pallets booked", value: mine(data.scheduled).reduce((t, s) => t + Number(s.pallets ?? 0), 0) },
        ]}
      />
      <div className="flex justify-end">
        <label className="flex items-center gap-2 text-sm text-slate-600">Show carrier
          <select className={`${inputCls} rounded-full px-3`} value={carrier} onChange={(e) => setCarrier(e.target.value)}>
            <option>All</option>{CARRIER_NAMES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
      </div>
      <Tabs tabs={[
        {
          id: "requests", label: "Collection requests", count: mine(data.requests).length,
          content: mine(data.requests).length
            ? <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">{mine(data.requests).map((s) => <Request key={s.id} s={s} r={r} />)}</ul>
            : <Empty text="No collection requests waiting." />,
        },
        {
          id: "scheduled", label: "Booked collections", count: mine(data.scheduled).length,
          content: mine(data.scheduled).length ? (
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
              {mine(data.scheduled).map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-4 px-4 py-3 text-sm">
                  <div className="w-28"><p className="font-semibold">{dayName(s.carrier_pickup_date)}</p><p className="text-xs text-slate-500">{s.carrier_pickup_time} · {s.carrier_ref}</p></div>
                  <div className="min-w-[9rem]"><ShipmentLink s={s} /></div>
                  <div className="flex-1">{s.origin_city} → {s.destination_city} · {s.pallets} pallets · {kg(s.gross_weight_kg)}</div>
                  <div className="text-xs text-slate-600">Delivery slot: {s.appointment_status === "confirmed" ? `${dmy(s.appointment_date)} ${s.appointment_time} (${s.appointment_ref})` : s.appointment_status === "not_needed" ? "not needed" : s.appointment_status ?? "not requested yet"}</div>
                  <StatusBadge status={s.status} />
                </li>
              ))}
            </ul>
          ) : <Empty text="No collections booked." />,
        },
        {
          id: "history", label: "History", count: mine(data.history).length,
          content: (
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
              {mine(data.history).map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-4 px-4 py-2.5 text-sm">
                  <div className="min-w-[9rem]"><ShipmentLink s={s} /></div>
                  <div className="flex-1">{s.selected_carrier ?? s.carrier_note?.split(":")[0]} · {s.carrier_status}{s.carrier_status === "declined" ? `: ${s.carrier_note?.split(": ").slice(1).join(": ")}` : ""}</div>
                  <StatusBadge status={s.status} />
                </li>
              ))}
            </ul>
          ),
        },
      ]} />
    </div>
  );
}
