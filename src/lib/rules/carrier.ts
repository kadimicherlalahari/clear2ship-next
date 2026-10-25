// Section 6: carrier selection. Pure code; Gemini never picks the carrier.
import { CARRIERS, MAX_KG_ANY_CARRIER, type Priority } from "./constants";
import type { CarrierOption, CarrierResult } from "./types";
import { fmt } from "./format";

type Input = {
  pallets: number;
  gross_weight_kg: number;
  destination_country: string;
  seller_priority: Priority | null;
  preferred_carrier?: string | null;
};

/** 0..1 where best = 1 and worst = 0 among the eligible carriers (all equal → 1). */
function scale(value: number, values: number[], higherIsBetter: boolean): number {
  const best = higherIsBetter ? Math.max(...values) : Math.min(...values);
  const worst = higherIsBetter ? Math.min(...values) : Math.max(...values);
  if (best === worst) return 1;
  return (worst - value) / (worst - best);
}

const round = (n: number, dp = 2) => Math.round(n * 10 ** dp) / 10 ** dp;

export function pickCarrier(input: Input): CarrierResult {
  const weightPerPallet = round(input.gross_weight_kg / input.pallets);
  const priorityMissing = !input.seller_priority;
  const priorityUsed: Priority = input.seller_priority ?? "Balanced";
  const minPalletsNeeded = Math.ceil(input.gross_weight_kg / MAX_KG_ANY_CARRIER);

  const removed: string[] = [];
  const eligible: CarrierOption[] = [];
  for (const c of CARRIERS) {
    // Exactly at the limit is allowed.
    if (weightPerPallet > c.maxKgPerPallet) {
      removed.push(`${c.name} removed: ${fmt(weightPerPallet)} kg/pallet is over its ${c.maxKgPerPallet} kg limit.`);
      continue;
    }
    eligible.push({
      name: c.name, service: c.service, transitDays: c.transitDays, onTimePct: c.onTimePct,
      maxKgPerPallet: c.maxKgPerPallet,
      price: input.pallets * c.pricePerPallet[input.destination_country],
    });
  }

  if (eligible.length === 0) {
    return {
      weightPerPallet, priorityUsed, priorityMissing, pick: null, alternatives: [], removed, noneFits: true,
      minPalletsNeeded,
      reason: `${fmt(weightPerPallet)} kg per pallet is over every carrier's limit. Use at least ${minPalletsNeeded} pallets.`,
    };
  }

  const prices = eligible.map((c) => c.price);
  const days = eligible.map((c) => c.transitDays);
  const onTime = eligible.map((c) => c.onTimePct);
  for (const c of eligible) {
    c.score = round(
      0.4 * scale(c.price, prices, false) + 0.3 * scale(c.transitDays, days, false) + 0.3 * scale(c.onTimePct, onTime, true),
      3,
    );
  }

  // Order the eligible carriers by the seller's priority; ties go to the lower price.
  const byPriority: Record<Priority, (a: CarrierOption, b: CarrierOption) => number> = {
    Cheapest: (a, b) => a.price - b.price || a.transitDays - b.transitDays,
    Fastest: (a, b) => a.transitDays - b.transitDays || a.price - b.price,
    "Most reliable": (a, b) => b.onTimePct - a.onTimePct || a.price - b.price,
    Balanced: (a, b) => (b.score ?? 0) - (a.score ?? 0) || a.price - b.price,
  };
  const ranked = [...eligible].sort(byPriority[priorityUsed]);
  const reasons: Record<Priority, string> = {
    Cheapest: "the lowest price of the carriers that can take this load",
    Fastest: "the fewest transit days of the carriers that can take this load",
    "Most reliable": "the highest on-time rate of the carriers that can take this load",
    Balanced: "the best balance of cost (40%), speed (30%) and reliability (30%)",
  };
  let reason = `Picked for ${reasons[priorityUsed]}.`;
  if (priorityMissing) reason = `No seller priority was given, so Balanced was used. ${reason}`;

  let pick = ranked[0];
  const preferred = input.preferred_carrier?.trim();
  if (preferred) {
    const pref = ranked.find((c) => c.name.toLowerCase() === preferred.toLowerCase());
    if (pref) {
      pick = pref;
      reason = `${pref.name} is your preferred carrier and it can take this load.`;
    } else {
      const why = removed.find((r) => r.toLowerCase().startsWith(preferred.toLowerCase()));
      reason = `${preferred} can't be used${why ? ` (${why.replace(/^.*removed: /, "")})` : ""}, so the next best one was picked: ${reason.charAt(0).toLowerCase()}${reason.slice(1)}`;
    }
  }

  return {
    weightPerPallet, priorityUsed, priorityMissing, pick, reason, removed, noneFits: false, minPalletsNeeded,
    alternatives: ranked.filter((c) => c !== pick),
  };
}
