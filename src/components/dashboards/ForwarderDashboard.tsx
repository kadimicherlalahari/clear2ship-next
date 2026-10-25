"use client";
import Link from "next/link";
import { useState } from "react";
import { Button, postJson, StatusBadge } from "../ui";
import { dayName, daysSince, dmy, Empty, inputCls, kg, Kpis, RowMessage, ShipmentLink, Stage, Tabs, useRowAction, type Row } from "./common";

type Data = { ready: Row[]; awaiting: Row[]; exceptions: Row[]; done: Row[]; coming: Row[]; toConfirm: Row[] };
type RunProps = { run: ReturnType<typeof useRowAction>["run"]; busy: string | null; msg: ReturnType<typeof useRowAction>["msg"] };
const money = (v: unknown) => `£${Number(v ?? 0).toLocaleString("en-GB", { maximumFractionDigits: 2 })}`;

function RefDate({ s, label, action, done, run, busy, msg }: RunProps & { s: Row; label: string; action: (ref: string, date: string) => Promise<unknown>; done: string }) {
  const [ref, setRef] = useState("");
  const [date, setDate] = useState("");
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        <input className={`${inputCls} w-36`} value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Declaration ref" aria-label={`Declaration reference for ${s.id}`} />
        <input className={`${inputCls} w-28`} value={date} onChange={(e) => setDate(e.target.value)} placeholder="DD-MM-YYYY" aria-label={`Date for ${s.id}`} />
        <Button disabled={busy === s.id} onClick={() => run(s.id, () => action(ref, date), done)}>{label}</Button>
      </div>
      <RowMessage id={s.id} msg={msg} />
    </div>
  );
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full min-w-[820px] text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>{head.map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  );
}

export function ForwarderDashboard({ data }: { data: Data }) {
  const r = useRowAction();
  const replied = data.exceptions.filter((s) => s.customs_reply_at);
  const declare = (id: string) => (ref: string, date: string) => postJson(`/api/shipments/${id}/declaration`, { ref, date });
  const resubmit = (id: string) => (ref: string, date: string) => postJson(`/api/shipments/${id}/actions`, { action: "resubmit", ref, date });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Freight forwarder: customs</h1>
        <p className="text-sm text-slate-600">Shipments the warehouse has accepted come to you to declare. Follow them through customs, deal with holds and rejections, then mark them delivered.</p>
      </div>
      <Kpis items={[
        { label: "Ready to declare", value: data.ready.length, tone: "sky" },
        { label: "With customs", value: data.awaiting.length },
        { label: "On hold / rejected", value: data.exceptions.length, tone: "red" },
        { label: "Seller replied, ready to resubmit", value: replied.length, tone: "amber" },
        { label: "Customs emails to confirm", value: data.toConfirm.length, tone: "amber" },
      ]} />

      <Tabs initial={data.exceptions.length && !data.ready.length ? "exceptions" : "ready"} tabs={[
        {
          id: "ready", label: "Ready to declare", count: data.ready.length,
          content: data.ready.length ? (
            <Table head={["Shipment", "Route", "Goods and value", "Collection", "Record your declaration"]}>
              {data.ready.map((s) => (
                <tr key={s.id} className="align-top">
                  <td className="px-3 py-2.5"><ShipmentLink s={s} /></td>
                  <td className="px-3 py-2.5">{s.origin_city} → {s.destination_city}, {s.destination_country}</td>
                  <td className="px-3 py-2.5"><p>{s.goods}</p><p className="text-xs text-slate-500">{money(s.declared_value)} · {s.cartons} cartons · {kg(s.gross_weight_kg)}</p></td>
                  <td className="px-3 py-2.5 text-xs">{s.selected_carrier} {s.carrier_ref ? `(${s.carrier_ref})` : ""}<br />{dmy(s.carrier_pickup_date)} {s.carrier_pickup_time ?? ""}</td>
                  <td className="px-3 py-2.5"><RefDate s={s} label="Declaration submitted" action={declare(s.id)} done="Declaration recorded." {...r} /></td>
                </tr>
              ))}
            </Table>
          ) : <Empty text="Nothing to declare right now. Shipments arrive here once the warehouse accepts the goods." />,
        },
        {
          id: "customs", label: "With customs", count: data.awaiting.length,
          content: data.awaiting.length ? (
            <Table head={["Shipment", "Declaration", "Waiting", "Customs emails", ""]}>
              {data.awaiting.map((s) => {
                const days = daysSince(s.declaration_date);
                return (
                  <tr key={s.id} className="align-top">
                    <td className="px-3 py-2.5"><ShipmentLink s={s} /></td>
                    <td className="px-3 py-2.5">{s.declaration_ref}<br /><span className="text-xs text-slate-500">{dmy(s.declaration_date)}</span></td>
                    <td className={`px-3 py-2.5 font-medium ${days > 3 ? "text-amber-700" : ""}`}>{days} day{days === 1 ? "" : "s"}{days > 3 ? " · chase customs?" : ""}</td>
                    <td className="px-3 py-2.5">{s.unconfirmed ? <span className="font-medium text-amber-800">{s.unconfirmed} to confirm</span> : <span className="text-slate-500">None yet</span>}</td>
                    <td className="px-3 py-2.5"><Link href={`/shipments/${s.id}#customs`} className="text-sm font-medium text-sky-700 hover:underline">Paste a customs email →</Link></td>
                  </tr>
                );
              })}
            </Table>
          ) : <Empty text="No declarations waiting on customs." />,
        },
        {
          id: "exceptions", label: "On hold / rejected", count: data.exceptions.length,
          content: data.exceptions.length ? (
            <ul className="space-y-3">
              {data.exceptions.map((s) => (
                <li key={s.id} className={`rounded-xl border bg-white p-4 ${s.status === "Rejected" ? "border-red-300" : "border-amber-300"}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-center gap-3"><ShipmentLink s={s} /><StatusBadge status={s.status} /></div>
                    <p className="text-xs text-slate-500">Declaration {s.declaration_ref} · {dmy(s.declaration_date)}</p>
                  </div>
                  <p className="mt-2 text-sm"><span className="text-xs font-semibold uppercase text-slate-500">Customs said:</span> <q className="italic">{s.customs_reason}</q></p>
                  {s.customs_next_steps && <p className="text-sm"><b>Asked for:</b> {s.customs_next_steps}</p>}
                  {s.customs_reply_at ? (
                    <div className="mt-2 space-y-2 rounded-lg bg-sky-50 p-3">
                      <p className="text-sm"><b>Seller replied {dmy(s.customs_reply_at)}:</b> {s.last_reply}</p>
                      <RefDate s={s} label="Record resubmission" action={resubmit(s.id)} done="Resubmission recorded. The seller has been told." {...r} />
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-amber-800">Waiting for the seller for {daysSince(s.hold_since ?? s.updated_at)} day{daysSince(s.hold_since ?? s.updated_at) === 1 ? "" : "s"}. <Link className="text-sky-700 hover:underline" href={`/shipments/${s.id}`}>Open</Link></p>
                  )}
                </li>
              ))}
            </ul>
          ) : <Empty text="No holds or rejections. 🎉" />,
        },
        {
          id: "confirm", label: "Emails to confirm", count: data.toConfirm.length,
          content: data.toConfirm.length ? (
            <Table head={["Shipment", "Suggested status", "Reason found", "Pasted", ""]}>
              {data.toConfirm.map((m) => (
                <tr key={m.id} className="align-top">
                  <td className="px-3 py-2.5"><Link href={`/shipments/${m.shipment_id}`} className="font-semibold text-sky-700 hover:underline">{m.shipment_id}</Link><p className="text-xs text-slate-500">{m.seller_name}</p></td>
                  <td className="px-3 py-2.5">{m.suggested_status ?? "Unclear"}</td>
                  <td className="px-3 py-2.5 text-xs italic">{m.suggested_reason ?? "–"}</td>
                  <td className="px-3 py-2.5 text-xs">{dmy(m.created_at)}</td>
                  <td className="px-3 py-2.5"><Link href={`/shipments/${m.shipment_id}#customs`} className="text-sm font-medium text-sky-700 hover:underline">Check and confirm →</Link></td>
                </tr>
              ))}
            </Table>
          ) : <Empty text="No customs emails waiting for confirmation." />,
        },
        {
          id: "coming", label: "Coming to you", count: data.coming.length,
          content: data.coming.length ? (
            <Table head={["Shipment", "Where it is now", "Carrier", "Expected at the warehouse", "Next step"]}>
              {data.coming.map((s) => (
                <tr key={s.id} className="align-top">
                  <td className="px-3 py-2.5"><ShipmentLink s={s} /></td>
                  <td className="px-3 py-2.5"><Stage s={s} /></td>
                  <td className="px-3 py-2.5 text-xs">{s.selected_carrier ?? "–"} · {s.carrier_status ?? "–"}</td>
                  <td className="px-3 py-2.5">{s.appointment_date ? `${dayName(s.appointment_date)} ${s.appointment_time ?? ""}` : dayName(s.expected_arrival)}</td>
                  <td className="px-3 py-2.5 text-xs text-slate-600">{s.pending_action}</td>
                </tr>
              ))}
            </Table>
          ) : <Empty text="Nothing on its way yet." />,
        },
        {
          id: "done", label: "Cleared and delivered", count: data.done.length,
          content: data.done.length ? (
            <Table head={["Shipment", "Status", "Declaration", "Last update", ""]}>
              {data.done.map((s) => (
                <tr key={s.id} className="align-top">
                  <td className="px-3 py-2.5"><ShipmentLink s={s} /></td>
                  <td className="px-3 py-2.5"><StatusBadge status={s.status} /></td>
                  <td className="px-3 py-2.5">{s.declaration_ref}</td>
                  <td className="px-3 py-2.5 text-xs">{dmy(s.updated_at)}</td>
                  <td className="px-3 py-2.5">
                    {s.status === "Cleared" && (
                      <>
                        <Button disabled={r.busy === s.id} onClick={() => r.run(s.id, () => postJson(`/api/shipments/${s.id}/delivered`, {}), "Marked as delivered.")}>Mark delivered</Button>
                        <RowMessage id={s.id} msg={r.msg} />
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          ) : <Empty text="Nothing cleared yet." />,
        },
      ]} />
    </div>
  );
}
