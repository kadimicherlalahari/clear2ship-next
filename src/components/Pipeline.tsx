"use client";

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

export function Pipeline({ shipment }: { shipment: Row }) {
  const { index, note, tone } = stageOf(shipment);
  const current = { ok: "bg-sky-600 ring-sky-200", red: "bg-red-600 ring-red-200", amber: "bg-amber-500 ring-amber-200" }[tone];
  const noteColor = { ok: "text-sky-800", red: "text-red-700", amber: "text-amber-800" }[tone];
  const done = shipment.status === "Delivered";
  return (
    <nav aria-label="Shipment progress" className="mt-2">
      <ol className="flex flex-wrap items-center gap-y-1 text-xs">
        {STAGES.map((label, i) => {
          const isDone = i < index || done;
          const isCurrent = i === index && !done;
          return (
            <li key={label} className="flex items-center" aria-current={isCurrent ? "step" : undefined}>
              <span className="flex items-center gap-1.5">
                <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold text-white ${isDone ? "bg-green-600" : isCurrent ? `${current} ring-4` : "bg-slate-300"}`}>
                  {isDone ? "✓" : ""}
                </span>
                <span className={isCurrent ? "font-semibold text-slate-900" : isDone ? "text-slate-700" : "text-slate-400"}>{label}</span>
                {isCurrent && <span className={`font-medium ${noteColor}`}>· {note}</span>}
              </span>
              {i < STAGES.length - 1 && <span className={`mx-2 h-px w-5 sm:w-8 ${i < index ? "bg-green-600" : "bg-slate-300"}`} aria-hidden />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
