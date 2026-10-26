"use client";
import { X } from "lucide-react";
import { PRIORITIES } from "@/lib/rules/constants";
import type { CarrierOption, CarrierResult } from "@/lib/rules/types";
import { Card, InfoNote, postJson } from "./ui";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Act = (fn: () => Promise<unknown>, done?: string) => Promise<void>;

const money = (n: number) => `£${n.toLocaleString("en-GB", { maximumFractionDigits: 2 })}`;
const PRIORITY_HELP: Record<string, string> = {
  Cheapest: "Lowest price",
  Fastest: "Fewest days",
  "Most reliable": "Best on-time rate",
  Balanced: "Cost 40 · speed 30 · reliability 30",
};

/** Ready date (or confirmed collection) + transit days, e.g. "Tue 10 Nov". */
function arrival(s: Row, days: number) {
  const from = s.carrier_pickup_date ?? s.collection_date ?? s.ready_date;
  if (!from) return null;
  const d = new Date(`${String(from).slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(d);
}

function Delta({ c, top }: { c: CarrierOption; top: CarrierOption }) {
  if (c === top) return <span className="text-xs text-slate-500">Top pick for this priority</span>;
  const parts: string[] = [];
  const dp = c.price - top.price;
  if (dp) parts.push(`${dp > 0 ? "+" : "−"}${money(Math.abs(dp))}`);
  const dd = c.transitDays - top.transitDays;
  if (dd) parts.push(`${Math.abs(dd)} day${Math.abs(dd) === 1 ? "" : "s"} ${dd < 0 ? "faster" : "slower"}`);
  const dr = c.onTimePct - top.onTimePct;
  if (dr) parts.push(`${dr > 0 ? "+" : "−"}${Math.abs(dr)}% on time`);
  return <span className="text-xs text-slate-500">vs #1: {parts.join(" · ") || "same"}</span>;
}

/** Ranked carriers for the seller's priority. One click selects a carrier; one click re-ranks for another priority. */
export function CarrierPanel({ carrier, shipment, canChoose, act, busy }: {
  carrier: CarrierResult | null; shipment: Row; canChoose: boolean; act: Act; busy: boolean;
}) {
  const locked = !!shipment.submitted_at && shipment.carrier_status !== "declined";
  const selectable = canChoose && !locked && !busy;

  if (!carrier) {
    return (
      <Card title="Carrier"><span id="carrier" />
        <InfoNote>Fix the missing booking details above (pallets, weight and destination) to see the carriers.</InfoNote>
      </Card>
    );
  }
  const ranked = carrier.pick ? [carrier.pick, ...carrier.alternatives] : [];
  const top = ranked[0];
  const best = {
    price: Math.min(...ranked.map((c) => c.price)),
    days: Math.min(...ranked.map((c) => c.transitDays)),
    onTime: Math.max(...ranked.map((c) => c.onTimePct)),
  };
  const chosen = ranked.find((c) => c.name === shipment.selected_carrier);
  const choose = (name: string) => selectable && name !== shipment.selected_carrier &&
    act(() => postJson(`/api/shipments/${shipment.id}/actions`, { action: "select-carrier", carrier: name }), `${name} selected.`);
  const rank = (p: string) => canChoose && !locked && p !== carrier.priorityUsed &&
    act(() => postJson(`/api/shipments/${shipment.id}/actions`, { action: "priority", priority: p }), `Recommendations regenerated for ${p}.`);

  return (
    <Card title="Carrier">
      <span id="carrier" />
      {/* What's chosen, at a glance */}
      <div className={`mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm ${chosen ? "bg-sky-50 text-sky-900" : "bg-amber-50 text-amber-900"}`}>
        {chosen ? (
          <span><b>{chosen.name}</b> selected · {money(chosen.price)} · {chosen.transitDays} days · arrives around {arrival(shipment, chosen.transitDays) ?? "?"}</span>
        ) : <span><b>No carrier selected yet.</b> Pick one below. It&apos;s needed before you can submit.</span>}
        {locked && <span className="text-xs">Locked after submit (changes only if the carrier declines)</span>}
      </div>

      {/* Re-rank in one click */}
      <div className="mb-3">
        <p className="mb-1.5 text-xs font-medium text-slate-600">Rank by what matters most. Change it any time your situation changes:</p>
        <div role="radiogroup" aria-label="Rank carriers by" className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {PRIORITIES.map((p) => {
            const on = p === carrier.priorityUsed;
            return (
              <button key={p} role="radio" aria-checked={on} disabled={!canChoose || locked || busy} onClick={() => rank(p)}
                className={`rounded-lg border px-3 py-1.5 text-left transition disabled:cursor-not-allowed ${on ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white hover:border-slate-400 disabled:opacity-60"}`}>
                <span className="block text-sm font-semibold">{p}</span>
                <span className={`block text-[11px] ${on ? "text-slate-300" : "text-slate-500"}`}>{PRIORITY_HELP[p]}</span>
              </button>
            );
          })}
        </div>
        {carrier.priorityMissing && <p className="mt-1 text-xs text-amber-800">No priority was given, so Balanced is used. Pick one to set it.</p>}
      </div>

      {ranked.length === 0 ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-800">{carrier.reason}</p>
      ) : (
        <ul className="space-y-2" role="radiogroup" aria-label="Choose a carrier">
          {ranked.map((c, i) => {
            const on = shipment.selected_carrier === c.name;
            const declined = ((shipment.declined_carriers ?? []) as string[]).includes(c.name);
            const tags = [
              c.price === best.price && "Cheapest",
              c.transitDays === best.days && "Fastest",
              c.onTimePct === best.onTime && "Most reliable",
            ].filter(Boolean) as string[];
            return (
              <li key={c.name}>
                <button role="radio" aria-checked={on} disabled={(!selectable && !on) || declined} onClick={() => choose(c.name)}
                  className={`flex w-full flex-wrap items-center gap-3 rounded-xl border p-3 text-left transition ${declined ? "border-slate-200 bg-slate-50 opacity-60" : on ? "border-sky-500 bg-sky-50 ring-2 ring-sky-500" : "border-slate-200 bg-white hover:border-slate-400 hover:shadow-sm"} ${!selectable || declined ? "cursor-default" : ""}`}>
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${on ? "border-sky-600 bg-sky-600" : "border-slate-300"}`}>
                    {on && <span className="h-2 w-2 rounded-full bg-white" />}
                  </span>
                  <span className="w-7 text-sm font-bold text-slate-400">#{i + 1}</span>
                  <span className="min-w-[11rem] flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="font-semibold">{c.name}</span>
                      <span className="text-sm text-slate-500">{c.service}</span>
                      {declined && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-800">Declined this collection</span>}
                      {i === 0 && !declined && <span className="rounded-full bg-green-600 px-2 py-0.5 text-[11px] font-semibold text-white">Recommended</span>}
                      {tags.map((t) => <span key={t} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">{t}</span>)}
                    </span>
                    <Delta c={c} top={top} />
                  </span>
                  <span className="grid grid-cols-4 gap-4 text-sm tabular-nums">
                    <span><span className="block text-[11px] text-slate-500">Price</span><b>{money(c.price)}</b></span>
                    <span><span className="block text-[11px] text-slate-500">Transit</span><b>{c.transitDays} days</b></span>
                    <span><span className="block text-[11px] text-slate-500">On time</span><b>{c.onTimePct}%</b></span>
                    <span><span className="block text-[11px] text-slate-500">Arrives</span><b>{arrival(shipment, c.transitDays) ?? "–"}</b></span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {carrier.pick && <p className="mt-2 text-xs text-slate-600">Why #1: {carrier.reason}{carrier.priorityUsed === "Balanced" && ` Scores: ${ranked.map((c) => `${c.name} ${c.score}`).join(", ")}.`}</p>}
      {carrier.removed.length > 0 && (
        <details className="mt-2 text-xs text-slate-500">
          <summary className="cursor-pointer">{carrier.removed.length} carrier{carrier.removed.length === 1 ? "" : "s"} can&apos;t take this load ({carrier.weightPerPallet.toLocaleString("en-GB")} kg per pallet)</summary>
          <ul className="mt-1 space-y-0.5">{carrier.removed.map((r) => <li key={r} className="flex items-start gap-1"><X className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />{r}</li>)}</ul>
        </details>
      )}
      {!canChoose && <p className="mt-3 text-xs text-slate-500">Switch to the Seller role to choose a carrier.</p>}
    </Card>
  );
}
