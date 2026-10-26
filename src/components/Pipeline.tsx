"use client";
import { Check } from "lucide-react";
import type { CSSProperties } from "react";
import { IsoGroup, IsoSvg, van, VanWheels } from "./illustrations/iso";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const STAGES = ["Draft", "Collection & slot", "Warehouse check", "Customs", "Cleared", "Delivered"];

/** Where the shipment is: the current stage, and whether it's stuck there (red / amber). */
export function stageOf(s: Row): { index: number; note: string; tone: "ok" | "red" | "amber" } {
  const status: string = s.status;
  if (status === "Delivered") return { index: 5, note: "Delivered", tone: "ok" };
  if (status === "Cleared") return { index: 4, note: "Cleared by customs", tone: "ok" };
  if (s.declaration_ref) {
    if (status === "Rejected") return { index: 3, note: "Rejected by customs", tone: "red" };
    if (status === "On hold") return { index: 3, note: s.customs_reply_at ? "On hold, seller replied" : "On hold, customs needs something", tone: "amber" };
    return { index: 3, note: "Waiting for customs", tone: "ok" };
  }
  if (!s.submitted_at) return { index: 0, note: status === "Draft" ? "Being prepared" : status, tone: "ok" };
  if (status === "Ready for customs") return { index: 3, note: "Ready to declare", tone: "ok" };
  if (status === "Mismatch") return { index: 2, note: "Warehouse rejected the goods", tone: "red" };
  const confirmed = s.carrier_status === "confirmed" && ["confirmed", "seller_booked", "not_needed"].includes(s.appointment_status ?? (s.destination_type === "Warehouse" ? "" : "not_needed"));
  if (!confirmed) {
    const tone = status === "Action required" ? "red" : s.appointment_status === "proposed" ? "amber" : "ok";
    const note = s.carrier_status === "declined" ? "Carrier declined" : s.appointment_status === "declined" ? "Slot declined"
      : s.appointment_status === "proposed" ? "New slot time proposed" : s.carrier_status === "confirmed" ? "Waiting for the delivery slot" : "Waiting for the carrier";
    return { index: 1, note, tone };
  }
  return { index: 2, note: status === "Action required" ? "Action required" : "Waiting for the goods check", tone: status === "Action required" ? "red" : "ok" };
}

/**
 * The shipment's road: six stops on asphalt with lane dashes, done ones ticked, the current one
 * orange (red or amber when stuck), and a small van that drives in from the previous stop once.
 */
export function Pipeline({ shipment }: { shipment: Row }) {
  const { index, note, tone } = stageOf(shipment);
  const done = shipment.status === "Delivered";
  const noteColor = { ok: "text-slate-700", red: "text-red-700", amber: "text-amber-800" }[tone];
  const stop = done ? STAGES.length - 1 : index;
  const at = (i: number) => `calc(9px + (100% - 18px) * ${i / (STAGES.length - 1)})`;
  return (
    <nav aria-label="Shipment progress" className="mt-3 w-full max-w-xl">
      <p className="sr-only">Stage {index + 1} of {STAGES.length}: {STAGES[index]}, {note}</p>
      <div className="relative h-14" aria-hidden>
        {/* the road: asphalt with orange lane dashes */}
        <div className="absolute left-0 right-0 top-[34px] h-[12px] rounded-full bg-slate-800">
          <div className="absolute inset-x-3 top-[5px] h-[2px] bg-[repeating-linear-gradient(90deg,var(--color-sky-500)_0_8px,transparent_8px_16px)]" />
        </div>
        {STAGES.map((label, i) => {
          const isDone = i < index || done;
          const isCurrent = i === index && !done;
          const tint = isCurrent ? { ok: "bg-sky-500", red: "bg-red-600", amber: "bg-amber-400" }[tone] : "";
          return (
            <span key={label} className="absolute top-[31px] -translate-x-1/2" style={{ left: at(i) }}>
              <span className={`flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 border-slate-900 ${isDone ? "bg-white" : isCurrent ? tint : "bg-slate-200"}`}>
                {isDone && <Check className="h-2.5 w-2.5" strokeWidth={4} />}
              </span>
            </span>
          );
        })}
        {/* the van drives from the previous stop to this one, once */}
        <span className="road-van absolute top-[9px] -translate-x-[38%]" style={{ "--from": at(Math.max(0, stop - 1)), "--to": at(stop), left: at(stop) } as CSSProperties}>
          <IsoSvg viewBox="-34 -38 76 52" label="" aria-hidden className="h-7 w-[40px] drop-shadow-sm">
            <IsoGroup prisms={van(-30, -12)} />
            <VanWheels x={-30} y={-12} />
          </IsoSvg>
        </span>
      </div>
      <ol className="relative mt-1.5 hidden h-4 text-[11px] leading-none sm:block">
        {STAGES.map((label, i) => {
          const isDone = i < index || done;
          const isCurrent = i === index && !done;
          const edge = i === 0 ? "translate-x-0" : i === STAGES.length - 1 ? "-translate-x-full" : "-translate-x-1/2";
          return (
            <li key={label} aria-current={isCurrent ? "step" : undefined}
              className={`absolute whitespace-nowrap ${edge} ${isCurrent ? "font-semibold text-slate-900" : isDone ? "text-slate-600" : "text-slate-400"}`}
              style={{ left: i === 0 ? 0 : i === STAGES.length - 1 ? "100%" : at(i) }}>
              {label}
            </li>
          );
        })}
      </ol>
      <p className={`mt-1.5 text-sm font-medium ${done ? "text-green-700" : noteColor}`}>{done ? "Delivered" : `${STAGES[index]} · ${note}`}</p>
    </nav>
  );
}
