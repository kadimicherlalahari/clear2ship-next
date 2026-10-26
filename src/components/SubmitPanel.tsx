"use client";
import { Check, Minus, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button, Card, ErrorNote, formatTime, InfoNote, postJson, ROLE_LABEL } from "./ui";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Act = (fn: () => Promise<unknown>, done?: string) => Promise<void>;
export type Readiness = { ready: boolean; items: { key: string; label: string; ok: boolean; detail: string; warning?: boolean }[] };

const dmy = (v: unknown) => (v ? String(v).slice(0, 10).split("-").reverse().join("-") : "");
const WINDOWS = ["08:00–12:00", "12:00–17:00", "Any time 08:00–17:00"];

/** Checklist + Submit booking. Submit opens a short question about the collection date and time. */
export function SubmitPanel({ shipment, readiness, canSubmit, act, busy, carrierPrice }: {
  shipment: Row; readiness: Readiness; canSubmit: boolean; act: Act; busy: boolean; carrierPrice: string | null;
}) {
  const [summaryOk, setSummaryOk] = useState(false);
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(dmy(shipment.ready_date));
  const [window, setWindow] = useState(WINDOWS[0]);
  const [err, setErr] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (open) dialog.current?.showModal(); else dialog.current?.close(); }, [open]);

  if (shipment.submitted_at) {
    return (
      <Card title="Booking submitted">
        <p className="text-sm">Submitted {formatTime(shipment.submitted_at)} with <b>{shipment.selected_carrier ?? "a carrier (declined, choose another)"}</b>.
          Collection requested for <b>{dmy(shipment.collection_date)}</b>, {shipment.collection_window}.</p>
      </Card>
    );
  }
  const enabled = readiness.ready && summaryOk && canSubmit;
  const send = () => act(async () => {
    setErr(null);
    try {
      await postJson(`/api/shipments/${shipment.id}/submit`, { summaryConfirmed: summaryOk, collection_date: date, collection_window: window });
      setOpen(false);
    } catch (e) { setErr((e as Error).message); throw e; }
  }, `Submitted. ${shipment.selected_carrier} has been asked to confirm the collection.`);

  return (
    <Card title="Submit booking">
      <ul className="mb-4 space-y-1.5">
        {readiness.items.map((i) => {
          const warn = !i.ok && i.warning;
          return (
            <li key={i.key} className="flex items-start gap-2 text-sm">
              <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${i.ok ? "bg-green-600 text-white" : warn ? "bg-amber-100 text-amber-700" : "bg-slate-200 text-slate-500"}`}>
                {i.ok ? <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden /> : warn ? <TriangleAlert className="h-3.5 w-3.5" aria-hidden /> : <Minus className="h-3.5 w-3.5" aria-hidden />}
              </span>
              <span>
                <span className={i.ok ? "text-slate-900" : "font-medium text-slate-900"}>{i.label}</span>
                {warn && <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-bold text-amber-800">WARNING</span>}
                {" "}<span className="text-slate-500">· {i.detail}</span>
              </span>
            </li>
          );
        })}
      </ul>
      {canSubmit ? (
        <>
          <label className="mb-3 flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-sky-600" checked={summaryOk} onChange={(e) => setSummaryOk(e.target.checked)} />
            I&apos;ve checked the booking, carrier and documents, and they&apos;re correct.
          </label>
          <Button disabled={!enabled || busy} onClick={() => setOpen(true)}>Submit booking</Button>
          {!readiness.ready && <p className="mt-2 text-xs text-slate-500">Submit unlocks when every item above has a tick. Warnings don&apos;t stop you.</p>}
          <p className="mt-2 text-xs text-slate-500">{shipment.selected_carrier ?? "Your carrier"} is asked to confirm the collection, then the warehouse for a delivery slot. Nothing is booked until they confirm.</p>
        </>
      ) : <InfoNote>Switch role to Seller to submit the booking.</InfoNote>}

      <dialog ref={dialog} onClose={() => setOpen(false)} className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-xl p-0 shadow-xl backdrop:bg-slate-900/40">
        <form method="dialog" className="space-y-4 p-5" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <h3 className="text-lg font-semibold">When should {shipment.selected_carrier} collect?</h3>
          <p className="text-sm text-slate-600">{shipment.selected_carrier}{carrierPrice ? ` · ${carrierPrice}` : ""} · from {shipment.origin_city} to {shipment.destination_city}</p>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Collection date</span>
            <input className="w-full rounded-md border border-slate-300 px-2 py-1.5" placeholder="DD-MM-YYYY" value={date} onChange={(e) => setDate(e.target.value)} />
            <span className="text-xs text-slate-500">Not before the ready date ({dmy(shipment.ready_date)}).</span>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Collection time</span>
            <select className="w-full rounded-md border border-slate-300 px-2 py-1.5" value={window} onChange={(e) => setWindow(e.target.value)}>
              {WINDOWS.map((w) => <option key={w}>{w}</option>)}
            </select>
          </label>
          <ErrorNote text={err} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? "Submitting…" : "Submit and request collection"}</Button>
          </div>
        </form>
      </dialog>
    </Card>
  );
}

const PILL: Record<string, string> = {
  requested: "bg-amber-100 text-amber-900", confirmed: "bg-green-100 text-green-800", declined: "bg-red-100 text-red-800",
  seller_booked: "bg-green-100 text-green-800", not_needed: "bg-slate-100 text-slate-600", waiting: "bg-slate-100 text-slate-600",
  proposed: "bg-amber-100 text-amber-900",
};
const PILL_TEXT: Record<string, string> = {
  requested: "Waiting for confirmation", confirmed: "Booked", declined: "Declined", seller_booked: "Booked by the seller",
  not_needed: "Not needed", waiting: "Requested after the carrier confirms", proposed: "New time proposed",
};

export function RespondForm({ who, onConfirm, onDecline, onPropose, busy, defaults }: {
  who: string; busy: boolean; defaults: { date: string; time: string };
  onConfirm: (v: { date: string; time: string; ref: string }) => void; onDecline: (note: string) => void;
  onPropose?: (v: { date: string; time: string; ref: string; note: string }) => void;
}) {
  const [date, setDate] = useState(defaults.date);
  const [time, setTime] = useState(defaults.time);
  const [ref, setRef] = useState("");
  const [note, setNote] = useState("");
  const input = "rounded-md border border-slate-300 px-2 py-1.5 text-sm";
  return (
    <div className="mt-3 space-y-2 rounded-lg bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{who}: confirm or decline</p>
      <div className="flex flex-wrap gap-2">
        <input className={input} aria-label="Date" placeholder="DD-MM-YYYY" value={date} onChange={(e) => setDate(e.target.value)} />
        <input className={input} aria-label="Time" placeholder="Time, e.g. 09:30" value={time} onChange={(e) => setTime(e.target.value)} />
        <input className={input} aria-label="Reference" placeholder="Reference" value={ref} onChange={(e) => setRef(e.target.value)} />
        <Button disabled={busy} onClick={() => onConfirm({ date, time, ref })}>Confirm</Button>
        {onPropose && <Button variant="secondary" disabled={busy} onClick={() => onPropose({ date, time, ref, note })}>Propose this time instead</Button>}
      </div>
      {onPropose && <p className="text-xs text-slate-500">Can&apos;t take the requested day? Enter another date and time and press Propose. The seller then accepts or declines.</p>}
      <div className="flex flex-wrap gap-2">
        <input className={`${input} flex-1`} aria-label="Note or reason" placeholder={onPropose ? "Note, or reason if declining" : "Reason, if declining"} value={note} onChange={(e) => setNote(e.target.value)} />
        <Button variant="danger" disabled={busy} onClick={() => onDecline(note)}>Decline</Button>
      </div>
    </div>
  );
}

/** After submit: the carrier confirms the collection, then the warehouse confirms the delivery slot. */
export function ConfirmationsPanel({ shipment: s, role, act, busy, canChooseCarrier }: { shipment: Row; role: string; act: Act; busy: boolean; canChooseCarrier: boolean }) {
  if (!s.submitted_at) return null;
  const post = (body: object, done: string) => act(() => postJson(`/api/shipments/${s.id}/actions`, body), done);
  const appt = s.appointment_status ?? (s.destination_type === "Warehouse" ? "waiting" : "not_needed");
  const carrierWho = role === "carrier" || role === "admin";
  const warehouseWho = role === "warehouse" || role === "admin";

  return (
    <Card title="Carrier and delivery slot">
      <span id="confirmations" />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 p-4">
          <div className="mb-1 flex items-center justify-between gap-2">
            <h3 className="font-semibold">1. Collection by {s.selected_carrier ?? "carrier"}</h3>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PILL[s.carrier_status] ?? PILL.waiting}`}>{PILL_TEXT[s.carrier_status] ?? "Not requested"}</span>
          </div>
          <p className="text-sm text-slate-600">Requested: {dmy(s.collection_date)}, {s.collection_window}</p>
          {s.carrier_status === "confirmed" && (
            <p className="mt-1 text-sm">Booked for <b>{dmy(s.carrier_pickup_date)} at {s.carrier_pickup_time}</b> · ref <b>{s.carrier_ref}</b> · confirmed {formatTime(s.carrier_confirmed_at)}</p>
          )}
          {s.carrier_status === "declined" && (
            <div className="mt-1 space-y-2 text-sm">
              <p className="text-red-800">Declined: {s.carrier_note}</p>
              {canChooseCarrier ? (
                <div className="flex flex-wrap items-center gap-2">
                  <a href="#carrier" className="font-semibold text-slate-900 decoration-sky-500 decoration-2 underline-offset-4 hover:underline focus-visible:underline">Choose another carrier</a>
                  <Button disabled={busy || !s.selected_carrier} onClick={() => post({ action: "resend-carrier" }, `Collection request sent to ${s.selected_carrier}.`)}>
                    Send request{ s.selected_carrier ? ` to ${s.selected_carrier}` : ""}
                  </Button>
                </div>
              ) : <p className="text-xs text-slate-500">The seller chooses another carrier.</p>}
            </div>
          )}
          {s.carrier_status === "requested" && (carrierWho
            ? <RespondForm who={ROLE_LABEL.carrier} busy={busy} defaults={{ date: dmy(s.collection_date), time: "" }}
                onConfirm={(v) => post({ action: "carrier-response", act: "confirm", pickup_date: v.date, pickup_time: v.time, ref: v.ref }, "Collection confirmed.")}
                onDecline={(note) => post({ action: "carrier-response", act: "decline", note }, "Collection declined. The seller has been told.")} />
            : <p className="mt-2 text-xs text-slate-500">Waiting for the carrier. Switch role to Carrier to confirm it.</p>)}
        </div>

        <div className="rounded-lg border border-slate-200 p-4">
          <div className="mb-1 flex items-center justify-between gap-2">
            <h3 className="font-semibold">2. Delivery slot at the warehouse</h3>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PILL[appt]}`}>{PILL_TEXT[appt]}</span>
          </div>
          <p className="text-sm text-slate-600">{s.destination_city}, {s.destination_country} ({s.destination_type})</p>
          {appt === "confirmed" && (
            <p className="mt-1 text-sm">Slot <b>{dmy(s.appointment_date)} at {s.appointment_time}</b> · ref <b>{s.appointment_ref}</b> · confirmed {formatTime(s.appointment_confirmed_at)}</p>
          )}
          {appt === "seller_booked" && <p className="mt-1 text-sm">You told us a delivery slot is already booked, so no request was sent.</p>}
          {appt === "not_needed" && <p className="mt-1 text-sm">Delivery to a business address doesn&apos;t need a slot.</p>}
          {appt === "waiting" && <p className="mt-1 text-sm">The slot is requested automatically once the carrier confirms the collection.</p>}
          {appt === "proposed" && (
            <div className="mt-2 space-y-2 rounded-lg bg-amber-50 p-3 text-sm">
              <p>The warehouse can&apos;t take the requested time and offers <b>{dmy(s.appointment_date)} at {s.appointment_time}</b> (ref {s.appointment_ref}).{s.appointment_note ? ` “${s.appointment_note}”` : ""}</p>
              {canChooseCarrier ? (
                <div className="flex gap-2">
                  <Button disabled={busy} onClick={() => post({ action: "answer-slot", accept: true }, "New slot accepted.")}>Accept this slot</Button>
                  <Button variant="secondary" disabled={busy} onClick={() => post({ action: "answer-slot", accept: false }, "Declined. The warehouse has been asked for another time.")}>Ask for another time</Button>
                </div>
              ) : <p className="text-xs text-slate-500">Waiting for the seller to accept or decline.</p>}
            </div>
          )}
          {appt === "declined" && (
            <div className="mt-1 space-y-2 text-sm">
              <p className="text-red-800">Declined: {s.appointment_note}</p>
              {canChooseCarrier && <Button disabled={busy} onClick={() => post({ action: "request-slot" }, "New delivery slot request sent.")}>Send a new slot request</Button>}
            </div>
          )}
          {appt === "requested" && (warehouseWho
            ? <RespondForm who={ROLE_LABEL.warehouse} busy={busy} defaults={{ date: "", time: "" }}
                onConfirm={(v) => post({ action: "appointment-response", act: "confirm", date: v.date, time: v.time, ref: v.ref }, "Delivery slot confirmed.")}
                onPropose={(v) => post({ action: "appointment-response", act: "propose", ...v }, "New time proposed to the seller.")}
                onDecline={(note) => post({ action: "appointment-response", act: "decline", note }, "Delivery slot declined.")} />
            : <p className="mt-2 text-xs text-slate-500">Waiting for the warehouse. Switch role to Warehouse to confirm it.</p>)}
        </div>
      </div>
    </Card>
  );
}
