// Sections 5 and 7: the fixed rulebook R-01..R-10 and the final result. Pure code.
import {
  BATTERIES_NOT_INCLUDED, DISCLAIMER, RESTRICTED_AMBER_WORDS, RESTRICTED_RED_WORDS,
} from "./constants";
import { pickCarrier } from "./carrier";
import { fmt, money } from "./format";
import { parseBooking, toDisplayDate } from "./parse";
import type { Booking, CheckResult, Issue, Overall, RawBooking } from "./types";

const issue = (code: string, severity: "RED" | "AMBER", key: string, message: string, fix: string,
  owner: Issue["owner"] = "seller", suggestion?: Issue["suggestion"]): Issue =>
  ({ code, kind: severity, severity, key: `${code}:${key}`, message, fix, owner, suggestion });

const wordRe = (w: string) => new RegExp(`(^|[^a-z])${w.replace(/[-]/g, "\\-")}([^a-z]|$)`, "i");

/** R-06 word check. Returns the matched word and level, or null. */
export function restrictedWord(description: string): { word: string; level: "RED" | "AMBER" } | null {
  let text = description.toLowerCase();
  const notIncluded = text.includes(BATTERIES_NOT_INCLUDED);
  text = text.replaceAll(BATTERIES_NOT_INCLUDED, " ");
  const red = RESTRICTED_RED_WORDS.find((w) => wordRe(w).test(text));
  if (red) return { word: red, level: "RED" };
  if (notIncluded) return { word: BATTERIES_NOT_INCLUDED, level: "AMBER" };
  const amber = RESTRICTED_AMBER_WORDS.find((w) => wordRe(w).test(text));
  return amber ? { word: amber, level: "AMBER" } : null;
}

/** Today's date in the UK (sellers ship from the UK), as YYYY-MM-DD. */
export const ukToday = (now = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(now);

export function runRules(b: Booking, today: string): { issues: Issue[]; notes: string[]; carrier: ReturnType<typeof pickCarrier> } {
  const issues: Issue[] = [];
  const notes: string[] = [];

  // R-01 HS code has at least 6 digits
  for (const it of b.items) {
    const code = it.hs_code ?? "";
    if (code.length < 6) {
      const hint = code.length === 5 ? ` It may have lost a leading zero (${code} → 0${code}).` : "";
      issues.push(issue("R-01", "RED", it.sku,
        `${it.sku}: HS code '${code}' has ${code.length} digits (needs 6+).`,
        `Add the correct code.${hint}`, "seller",
        code.length === 5 ? { sku: it.sku, field: "hs_code", value: `0${code}`, label: `Use 0${code}` } : undefined));
    }
  }

  // R-02 declared value = sum(qty × unit price), within 1% (exactly 1% passes)
  const itemsValue = Math.round(b.items.reduce((s, i) => s + i.quantity * i.unit_price, 0) * 100) / 100;
  const r02 = Math.abs(b.declared_value - itemsValue) > 0.01 * itemsValue + 1e-9;
  if (r02) {
    issues.push(issue("R-02", "RED", "value",
      `Declared ${money(b.declared_value)} but items add up to ${money(itemsValue)}.`,
      `Change the value to ${money(itemsValue)} or correct the items.`, "seller",
      { field: "declared_value", value: itemsValue, label: `Set value to ${money(itemsValue)}` }));
  }

  // R-03 units per carton × cartons = quantity
  let r03 = false;
  for (const it of b.items) {
    const c = it.units_per_carton * it.cartons;
    if (c !== it.quantity) {
      r03 = true;
      issues.push(issue("R-03", "RED", it.sku,
        `${it.sku}: ${fmt(it.units_per_carton)} × ${fmt(it.cartons)} = ${fmt(c)}, but quantity is ${fmt(it.quantity)}.`,
        "Correct the quantity or cartons."));
    }
  }

  // R-04 booking cartons = sum of item cartons
  const itemCartons = b.items.reduce((s, i) => s + i.cartons, 0);
  if (b.cartons !== itemCartons) {
    issues.push(issue("R-04", "RED", "cartons",
      `Booking says ${fmt(b.cartons)} cartons, items add up to ${fmt(itemCartons)}.`,
      `Set it to ${fmt(itemCartons)}.`, "seller",
      { field: "cartons", value: itemCartons, label: `Set cartons to ${itemCartons}` }));
  }

  // R-05 weight per pallet within the chosen carrier's limit (section 6)
  const carrier = pickCarrier(b);
  if (carrier.noneFits) {
    issues.push(issue("R-05", "RED", "weight", carrier.reason,
      `Use at least ${carrier.minPalletsNeeded} pallets.`, "seller",
      { field: "pallets", value: carrier.minPalletsNeeded, label: `Set pallets to ${carrier.minPalletsNeeded}` }));
  }

  // R-06 restricted goods (word check in the description)
  for (const it of b.items) {
    const hit = restrictedWord(it.description);
    if (hit?.level === "RED") {
      issues.push(issue("R-06", "RED", it.sku, `${it.sku} looks like a restricted item.`,
        "Remove it or use a dangerous-goods carrier."));
    } else if (hit) {
      issues.push(issue("R-06", "AMBER", it.sku,
        `${it.sku} might be a restricted item ("${hit.word}"). Please confirm.`,
        "Check it isn't a battery, aerosol or flammable item. If it is, remove it or use a dangerous-goods carrier."));
    }
  }

  // R-07 gross weight ≥ goods weight
  const goodsWeight = Math.round(b.items.reduce((s, i) => s + i.unit_weight_kg * i.quantity, 0) * 100) / 100;
  if (b.gross_weight_kg < goodsWeight) {
    issues.push(issue("R-07", "AMBER", "weight",
      `Gross weight ${fmt(b.gross_weight_kg)} kg is less than the goods alone (${fmt(goodsWeight)} kg).`,
      "Re-weigh the shipment.", "warehouse"));
  }

  // R-08 warehouse delivery needs an appointment
  if (b.destination_type === "Warehouse" && b.appointment_booked !== true) {
    issues.push(issue("R-08", "AMBER", "appointment",
      "No delivery slot booked; the warehouse may refuse the truck.", "Book a delivery slot."));
  }

  // R-09 every item has a country of origin
  for (const it of b.items) {
    if (!it.country_of_origin) {
      issues.push(issue("R-09", "AMBER", it.sku, `${it.sku}: country of origin missing.`, "Add where it was made."));
    }
  }

  // R-10 ready date today or later (UK date)
  if (b.ready_date < today) {
    issues.push(issue("R-10", "AMBER", "date", `Ready date ${toDisplayDate(b.ready_date)} is in the past.`,
      "Choose today or later."));
  }

  // Missing priority: Balanced used, shown as an AMBER note (section 6)
  if (carrier.priorityMissing) {
    issues.push(issue("PRIORITY", "AMBER", "priority",
      "No seller priority was given, so the Balanced choice was used.",
      "Choose Cheapest, Fastest, Most reliable or Balanced."));
  }

  if (r02 && r03) notes.push("R-02 is probably caused by the R-03 mistake. Fix that first.");

  return { issues, notes, carrier };
}

/** Full check for one booking: input checks, then (if no input ERRORs) R-01..R-10 and the carrier. */
export function checkBooking(raw: RawBooking, opts: { today?: string } = {}): CheckResult {
  const today = opts.today ?? ukToday();
  const { booking, issues: inputIssues } = parseBooking(raw);
  const inputErrors = inputIssues.filter((i) => i.kind === "ERROR");

  if (inputErrors.length > 0) {
    // Show the carrier it would be after the fix, if the numbers needed for it are readable.
    const carrier = booking.pallets && booking.gross_weight_kg && booking.destination_country
      ? pickCarrier({
          pallets: booking.pallets, gross_weight_kg: booking.gross_weight_kg,
          destination_country: booking.destination_country, seller_priority: booking.seller_priority,
          preferred_carrier: booking.preferred_carrier,
        })
      : null;
    const n = inputErrors.length;
    return {
      overall: "RED", inputBlocked: true, issues: inputIssues, notes: [],
      headline: `Not ready to ship. Fix ${n} problem${n === 1 ? "" : "s"} first. The 10 checks run once the details are complete.`,
      carrier, disclaimer: DISCLAIMER, booking,
    };
  }

  const { issues, notes, carrier } = runRules(booking as Booking, today);
  const all = [...inputIssues, ...issues];
  const reds = all.filter((i) => i.severity === "RED").length;
  const ambers = all.filter((i) => i.severity === "AMBER").length;
  const overall: Overall = reds ? "RED" : ambers ? "AMBER" : "GREEN";
  const pick = carrier.pick;
  const carrierText = pick ? `${pick.name}, ${money(pick.price)}, ${pick.transitDays} days` : "";

  let headline: string;
  if (overall === "RED") {
    headline = `Not ready to ship. Fix ${reds} problem${reds === 1 ? "" : "s"} first.` +
      (pick ? ` After the fix it would be ${carrierText}.` : "");
  } else if (overall === "AMBER") {
    headline = `Can ship, but ${ambers} item${ambers === 1 ? "" : "s"} should be checked. Carrier: ${carrierText}.`;
  } else {
    headline = `Passed all 10 checks. Recommended: ${carrierText}. Next: confirm to book collection.`;
  }

  return { overall, headline, inputBlocked: false, issues: all, notes, carrier, disclaimer: DISCLAIMER, booking };
}
