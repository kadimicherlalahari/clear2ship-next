"use client";
import { PackageCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { box, IsoGroup, IsoSvg, van, VanWheels } from "./illustrations/iso";

export type MomentKind = "submitted" | "cleared" | "delivered";

const TEXT: Record<MomentKind, { title: string; line: string }> = {
  submitted: { title: "Booking submitted", line: "Collection requested. We'll tell you when the carrier confirms." },
  cleared: { title: "Cleared by customs", line: "Confirmed by a person. Next: delivery." },
  delivered: { title: "Delivered", line: "That's the whole journey done." },
};

/** A short celebration card in the corner when a shipment reaches a milestone in front of you. */
export function MomentToast({ kind, onDone }: { kind: MomentKind; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2700);
    return () => clearTimeout(t);
  }, [onDone]);
  const t = TEXT[kind];
  return (
    <div role="status" className="anim-rise-fade fixed bottom-5 right-5 z-50 flex w-[min(22rem,calc(100vw-2.5rem))] items-center gap-3 rounded-2xl bg-slate-900 p-3 pr-5 text-white shadow-lg">
      <div className="h-16 w-20 shrink-0 overflow-visible">
        {kind === "submitted" && <BoxesIntoVan />}
        {kind === "cleared" && <ClearedStamp small />}
        {kind === "delivered" && (
          <span className="anim-pop flex h-16 w-16 items-center justify-center rounded-full bg-green-600"><PackageCheck className="h-8 w-8" aria-hidden /></span>
        )}
      </div>
      <div>
        <p className="font-bold">{t.title}</p>
        <p className="text-sm text-slate-300">{t.line}</p>
      </div>
    </div>
  );
}

function BoxesIntoVan() {
  return (
    <IsoSvg viewBox="-70 -70 120 90" label="" aria-hidden className="h-16 w-20">
      <IsoGroup prisms={van(-40, -10)} />
      <VanWheels x={-40} y={-10} />
      <g className="anim-box-drop" style={{ animationDelay: "80ms" }}><IsoGroup prisms={[box(-30, -10, 32, 13)]} /></g>
      <g className="anim-box-drop" style={{ animationDelay: "320ms" }}><IsoGroup prisms={[box(-12, -10, 32, 13)]} /></g>
    </IsoSvg>
  );
}

/** A round customs stamp, "CLEARED", that thumps down once. */
export function ClearedStamp({ small = false, label = "CLEARED" }: { small?: boolean; label?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={`anim-stamp ${small ? "h-16 w-16" : "h-24 w-24"}`} aria-hidden>
      <circle cx="60" cy="60" r="54" fill="none" stroke="#ff5a1f" strokeWidth="5" />
      <circle cx="60" cy="60" r="44" fill="none" stroke="#ff5a1f" strokeWidth="2" strokeDasharray="3 4" />
      <rect x="10" y="48" width="100" height="26" rx="4" fill="#ff5a1f" />
      <text x="60" y="67" textAnchor="middle" fontSize="17" fontWeight="800" fill="#151412" fontFamily="var(--font-archivo), sans-serif" letterSpacing="1.5">{label}</text>
      <text x="60" y="36" textAnchor="middle" fontSize="9" fontWeight="700" fill="#ff5a1f" fontFamily="var(--font-archivo), sans-serif" letterSpacing="2">CUSTOMS</text>
      <text x="60" y="92" textAnchor="middle" fontSize="9" fontWeight="700" fill="#ff5a1f" fontFamily="var(--font-archivo), sans-serif" letterSpacing="2">CLEAR2SHIP</text>
    </svg>
  );
}

/** Watch a shipment's status and return the milestone it just reached (once). */
export function useMilestone(status: string | undefined, submitted: boolean) {
  const [prev, setPrev] = useState<{ status?: string; submitted: boolean } | null>(null);
  const [moment, setMoment] = useState<MomentKind | null>(null);
  useEffect(() => {
    if (status === undefined) return;
    if (prev) {
      if (!prev.submitted && submitted) setMoment("submitted");
      else if (prev.status !== "Cleared" && status === "Cleared") setMoment("cleared");
      else if (prev.status !== "Delivered" && status === "Delivered") setMoment("delivered");
    }
    setPrev({ status, submitted });
  }, [status, submitted]); // eslint-disable-line react-hooks/exhaustive-deps
  return { moment, clear: () => setMoment(null) };
}
