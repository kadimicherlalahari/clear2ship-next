// Chat booking (section 3). Gemini only turns the message into field values; code decides what is
// missing, what to ask (max 3 at a time, fixed order), validates values and runs the checks.
import { q } from "./db";
import { answerAboutShipment, extractFromChat, explainResult, GeminiUnavailable, type ChatExtraction } from "./gemini";
import {
  ALL_DESTINATION_CITIES, BOOKING_LABELS, DESTINATIONS, DESTINATION_COUNTRIES, DESTINATION_TYPES, ITEM_LABELS,
  ITEM_ORIGINS, ORIGIN_CITIES, PRIORITIES,
} from "./rules/constants";
import { money, fmt } from "./rules/format";
import { cleanHsCode, cleanNumber, matchAllowed, parseBooking, parseDate, parseYesNo, toDisplayDate } from "./rules/parse";
import type { RawBooking, RawItem } from "./rules/types";
import {
  createShipment, getShipment, logEvent, rankedCarriers, runAllChecks, toRawBooking, updateBooking, type Actor, type FullCheck,
} from "./shipments";

export type ChatState = { unknown: string[]; awaitingConfirm: boolean; confirmed: boolean; lastQuestion: string | null };
const newState = (): ChatState => ({ unknown: [], awaitingConfirm: false, confirmed: false, lastQuestion: null });

const blank = (v: unknown) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");
const YES = /^\s*(yes|yep|yeah|y|correct|that'?s (right|correct)|looks (good|right)|confirm(ed)?|ok(ay)?|all good)\b/i;
const NO = /^\s*(no|nope|not quite|wrong|incorrect)\b/i;

// ---------------------------------------------------------------- validation of one chat value

const WHOLE = ["pallets", "cartons", "quantity", "units_per_carton"];
const POSITIVE = ["declared_value", "gross_weight_kg", "unit_price", "unit_weight_kg"];

/** Validate a single value from chat. Returns the value to store, or a message asking to choose again. */
function validate(field: string, value: string, label: string, raw: RawBooking): { ok: true; value: unknown } | { ok: false; message: string } {
  const list = (choices: readonly string[]) => {
    const hit = matchAllowed(value, choices);
    return hit ? { ok: true as const, value: hit } : { ok: false as const, message: `${value} isn't supported. Choose one of: ${choices.join(", ")}.` };
  };
  switch (field) {
    case "origin_city": return list(ORIGIN_CITIES);
    case "destination_country": return list(DESTINATION_COUNTRIES);
    case "destination_city": {
      const country = matchAllowed(raw.destination_country, DESTINATION_COUNTRIES);
      return list(country ? DESTINATIONS[country] : ALL_DESTINATION_CITIES);
    }
    case "destination_type": {
      // "a warehouse" / "their office address" → the allowed wording
      const v = /ware\s*house/i.test(value) ? "Warehouse" : /business|office|shop|store|address/i.test(value) ? "Business address" : value;
      const hit = matchAllowed(v, DESTINATION_TYPES);
      return hit ? { ok: true, value: hit } : { ok: false, message: `${value} isn't supported. Choose one of: ${DESTINATION_TYPES.join(", ")}.` };
    }
    case "seller_priority": return list(PRIORITIES);
    case "country_of_origin": return list(ITEM_ORIGINS);
    case "appointment_booked": {
      const yn = parseYesNo(value);
      return yn === null ? { ok: false, message: `${value} isn't supported. Choose one of: Yes, No.` } : { ok: true, value: yn ? "Yes" : "No" };
    }
    case "ready_date": {
      const d = parseDate(value);
      return d ? { ok: true, value: toDisplayDate(d) } : { ok: false, message: "Please enter the date as DD-MM-YYYY." };
    }
    case "hs_code": {
      const hs = cleanHsCode(value);
      return hs === "invalid" || hs === null ? { ok: false, message: `${label}: HS code must contain digits only.` } : { ok: true, value: hs };
    }
  }
  if (WHOLE.includes(field) || POSITIVE.includes(field)) {
    const n = cleanNumber(value);
    if (isNaN(n) || n <= 0) return { ok: false, message: `${label} must be a number above 0.` };
    if (WHOLE.includes(field) && !Number.isInteger(n)) return { ok: false, message: `${label} must be a whole number.` };
    return { ok: true, value: n };
  }
  return { ok: true, value: value.trim() };
}

// ---------------------------------------------------------------- merge Gemini's fields into the booking

/**
 * Safety net for short answers like "SouthAsian Foods, Rotterdam, Warehouse": when the app just asked for a field
 * and the seller's message contains exactly one of its allowed values word for word, take it. This reads the
 * seller's own words against fixed lists (no guessing), and never overrides what Gemini read or what's saved.
 */
export function fillFromAllowedWords(message: string, lastQuestion: string | null, raw: RawBooking, ex: ChatExtraction): ChatExtraction {
  const asked = (lastQuestion ?? "").toLowerCase();
  const one = (options: readonly string[]) => {
    const found = options.filter((o) => new RegExp(`(^|[^a-z])${o}([^a-z]|$)`, "i").test(message));
    return found.length === 1 ? found[0] : null;
  };
  const booking = { ...ex.booking };
  const add = (field: string, askedFor: string, value: string | null) => {
    if (value && asked.includes(askedFor) && !booking[field] && blank(raw[field])) booking[field] = { value, source: value };
  };
  add("destination_city", "destination city", one(ALL_DESTINATION_CITIES));
  const type = one(["warehouse", "business address"]);
  add("destination_type", "warehouse or a business address", type && (type === "warehouse" ? "Warehouse" : "Business address"));
  const priority = one(["cheapest", "fastest", "most reliable", "balanced"]);
  add("seller_priority", "what matters most", priority && priority[0].toUpperCase() + priority.slice(1));
  return { ...ex, booking };
}

export function applyExtraction(raw: RawBooking, ex: ChatExtraction): { raw: RawBooking; rejected: string[]; derived: string[] } {
  const next: RawBooking = { ...raw, items: (raw.items ?? []).map((i) => ({ ...i })) };
  const rejected: string[] = [];
  const derived: string[] = [];

  // Country first, so the city is checked against the right list.
  const order = ["destination_country", ...Object.keys(ex.booking).filter((k) => k !== "destination_country")];
  for (const field of order) {
    const f = ex.booking[field];
    if (!f) continue;
    const label = BOOKING_LABELS[field as keyof typeof BOOKING_LABELS] ?? field;
    const v = validate(field, f.value, label, next);
    if (!v.ok) { rejected.push(v.message); continue; }
    next[field] = v.value;
    if (field === "destination_city") {
      const country = DESTINATION_COUNTRIES.find((c) => DESTINATIONS[c].includes(String(v.value)));
      if (country && next.destination_country !== country) {
        next.destination_country = country;
        derived.push(`${v.value} is in ${country}, so the destination country is ${country}.`);
      }
    }
  }
  if (blank(next.origin_country) && !blank(next.origin_city)) next.origin_country = "United Kingdom";

  const items = next.items!;
  for (const exItem of ex.items) {
    const sku = exItem.sku?.value?.trim();
    let target: RawItem | undefined = sku ? items.find((i) => String(i.sku ?? "").toLowerCase() === sku.toLowerCase()) : undefined;
    if (!target && !sku) target = items.find((i) => blank(i.sku)) ?? (items.length === 1 ? items[0] : undefined);
    if (!target && sku) target = items.find((i) => blank(i.sku));
    if (!target) { target = {}; items.push(target); }
    for (const [field, f] of Object.entries(exItem)) {
      const who = String(target.sku ?? sku ?? `Item ${items.indexOf(target) + 1}`);
      const label = `${who}: ${ITEM_LABELS[field as keyof typeof ITEM_LABELS] ?? field}`;
      const v = validate(field, f.value, label, next);
      if (!v.ok) { rejected.push(v.message); continue; }
      target[field] = v.value;
    }
  }
  return { raw: next, rejected, derived };
}

// ---------------------------------------------------------------- what to ask next

const ASK: Record<string, string> = {
  seller_name: "your business name",
  origin_city: `which city it ships from (${ORIGIN_CITIES.join(", ")})`,
  destination_city: "the destination city (Berlin, Frankfurt, Hamburg, Paris, Lyon, Amsterdam or Rotterdam)",
  destination_type: "whether it's going to a warehouse or a business address",
  appointment_booked: "whether a delivery slot is booked at the warehouse (yes or no)",
  ready_date: "the date it's ready to ship (DD-MM-YYYY)",
  seller_priority: "what matters most: cheapest, fastest, most reliable or balanced",
  pallets: "how many pallets",
  cartons: "how many cartons in total",
  gross_weight_kg: "the total gross weight in kg",
  declared_value: "the total declared value in GBP",
};
const ASK_ITEM: Record<string, string> = {
  sku: "the SKU", description: "a short description", quantity: "the quantity (units)",
  units_per_carton: "units per carton", cartons: "how many cartons", unit_price: "the unit price in GBP",
  unit_weight_kg: "the unit weight in kg", hs_code: "the HS code (6+ digits, or say you don't know)",
  country_of_origin: `the country of origin (${ITEM_ORIGINS.join(", ")})`,
};

/** Required fields still empty (or invalid), in the fixed order of section 3, minus ones the seller said they don't know. */
export function missingFields(raw: RawBooking, state: ChatState): { key: string; ask: string }[] {
  const { booking } = parseBooking(raw);
  const out: { key: string; ask: string }[] = [];
  const need = (key: string, empty: boolean, ask: string) => { if (empty && !state.unknown.includes(key)) out.push({ key, ask }); };

  need("seller_name", !booking.seller_name, ASK.seller_name);
  need("origin_city", !booking.origin_city, ASK.origin_city);
  need("destination_city", !booking.destination_city,
    booking.destination_country ? `the destination city (${DESTINATIONS[booking.destination_country].join(", ")})` : ASK.destination_city);
  need("destination_type", !booking.destination_type, ASK.destination_type);
  if (booking.destination_type === "Warehouse") need("appointment_booked", booking.appointment_booked === null, ASK.appointment_booked);
  need("ready_date", !booking.ready_date, ASK.ready_date);
  need("seller_priority", !booking.seller_priority, ASK.seller_priority);
  need("pallets", !booking.pallets, ASK.pallets);
  need("cartons", !booking.cartons, ASK.cartons);
  need("gross_weight_kg", !booking.gross_weight_kg, ASK.gross_weight_kg);
  need("declared_value", !booking.declared_value, ASK.declared_value);

  if (booking.items.length === 0) {
    out.push({ key: "items", ask: "what you're shipping: for each product, the SKU, description, quantity, units per carton, cartons, unit price (GBP), unit weight (kg), HS code and country of origin" });
  }
  booking.items.forEach((it, i) => {
    const who = it.sku ?? `item ${i + 1}`;
    for (const f of ["sku", "description", "quantity", "units_per_carton", "cartons", "unit_price", "unit_weight_kg", "hs_code", "country_of_origin"] as const) {
      need(f, it[f] === null, `${who}: ${ASK_ITEM[f]}`);
    }
  });
  return out;
}

// ---------------------------------------------------------------- texts

export function summaryText(raw: RawBooking): string {
  const { booking: b } = parseBooking(raw);
  const lines = [
    `Seller: ${b.seller_name}`,
    `Route: ${b.origin_city}, United Kingdom → ${b.destination_city}, ${b.destination_country} (${b.destination_type}${b.destination_type === "Warehouse" ? `, delivery slot booked: ${b.appointment_booked ? "Yes" : "No"}` : ""})`,
    `Ready to ship: ${b.ready_date ? toDisplayDate(b.ready_date) : "?"} · Priority: ${b.seller_priority ?? "not given (Balanced will be used)"}`,
    `${b.pallets} pallets · ${b.cartons} cartons · ${fmt(b.gross_weight_kg ?? 0)} kg · ${money(b.declared_value ?? 0)}`,
    ...b.items.map((i) => `Item ${i.sku}: ${i.description}, ${fmt(i.quantity ?? 0)} units × ${money(i.unit_price ?? 0)}, ${i.units_per_carton}/carton × ${i.cartons} cartons, ${i.unit_weight_kg} kg each, HS ${i.hs_code ?? "unknown"}, made in ${i.country_of_origin ?? "unknown"}`),
  ];
  return lines.join("\n");
}

export function resultText(r: FullCheck): string {
  const out = [r.headline];
  for (const i of r.issues) out.push(`• ${i.code} ${i.kind}: ${i.message} Fix: ${i.fix} (Who: ${i.owner})`);
  for (const n of r.notes) out.push(`Note: ${n}`);
  if (r.carrier?.pick) {
    const p = r.carrier.pick;
    out.push(`Carrier: ${p.name} (${p.service}), ${money(p.price)}, ${p.transitDays} days, ${p.onTimePct}% on time. ${r.carrier.reason}`);
    if (r.carrier.alternatives.length) {
      out.push(`Other options: ${r.carrier.alternatives.map((a) => `${a.name} ${money(a.price)}, ${a.transitDays} days, ${a.onTimePct}%`).join(" · ")}`);
    }
  }
  for (const rm of r.carrier?.removed ?? []) out.push(rm);
  out.push(r.disclaimer);
  return out.join("\n");
}

// ---------------------------------------------------------------- one chat turn

export type ChatReply = { shipmentId: string; reply: string; fallback?: boolean; complete: boolean; result?: FullCheck };

async function save(shipmentId: string, role: "seller" | "app", content: string) {
  await q("INSERT INTO chat_messages (shipment_id, role, content) VALUES ($1,$2,$3)", [shipmentId, role, content]);
}

export async function handleChatMessage(shipmentId: string | null, message: string, actor: Actor): Promise<ChatReply> {
  const id = shipmentId ?? (await createShipment(actor, {}));
  if (!shipmentId) await logEvent(id, actor, "Started a booking in chat");
  await save(id, "seller", message);

  const bundle = (await getShipment(id))!;
  const state: ChatState = { ...newState(), ...(bundle.shipment.chat_state ?? {}) };
  if (bundle.shipment.submitted_at) { state.confirmed = true; state.awaitingConfirm = false; }
  const oldRaw = toRawBooking(bundle.shipment, bundle.items);
  const isYes = state.awaitingConfirm && YES.test(message);
  const isNo = state.awaitingConfirm && NO.test(message);

  let ex: ChatExtraction = { booking: {}, items: [], unknown: [] };
  if (!isYes) {
    try {
      ex = fillFromAllowedWords(message, state.lastQuestion, oldRaw,
        await extractFromChat(message, state.lastQuestion, (oldRaw.items ?? []).map((i) => String(i.sku ?? "")).filter(Boolean)));
    } catch (e) {
      const reply = "Sorry, I couldn't read that message just now. Please use the step-by-step form below instead. Nothing you entered has been lost.";
      await save(id, "app", reply);
      if (!(e instanceof GeminiUnavailable)) throw e;
      return { shipmentId: id, reply, fallback: true, complete: false };
    }
  }
  state.unknown = [...new Set([...state.unknown, ...ex.unknown])];

  const hasFields = Object.keys(ex.booking).length > 0 || ex.items.length > 0;
  const s0 = bundle.shipment;

  // Once the booking is confirmed (or submitted), a message without booking details is a question:
  // answer it from the shipment's facts only.
  if (!isYes && !hasFields && !ex.unknown.length && (state.confirmed || s0.submitted_at)) {
    const check = runAllChecks(bundle);
    const d = (v: unknown) => (v ? toDisplayDate((v instanceof Date ? v.toISOString() : String(v)).slice(0, 10)) : null);
    const facts = {
      shipment: s0.id, status: s0.status, next_step: s0.pending_action, responsible: s0.responsible_role,
      booking: summaryText(oldRaw),
      open_problems: check.allIssues.map((i) => `${i.code} ${i.kind}: ${i.message} Fix: ${i.fix}`),
      chosen_carrier: s0.selected_carrier,
      carrier_options: rankedCarriers(check).map((c) => `${c.name} £${c.price}, ${c.transitDays} days, ${c.onTimePct}%`),
      submitted: !!s0.submitted_at,
      collection_requested_by_seller: s0.collection_date ? `${d(s0.collection_date)}, ${s0.collection_window}` : null,
      carrier_status: s0.carrier_status ?? "not requested yet",
      collection_confirmed_by_carrier: s0.carrier_status === "confirmed" ? `${d(s0.carrier_pickup_date)} at ${s0.carrier_pickup_time}` : null,
      carrier_reference: s0.carrier_ref,
      delivery_slot_status: s0.appointment_status ?? "not requested yet",
      delivery_slot_confirmed_by_warehouse: s0.appointment_status === "confirmed" ? `${d(s0.appointment_date)} at ${s0.appointment_time} (ref ${s0.appointment_ref})` : null,
      warehouse_goods_check: s0.warehouse_result ?? "not done yet",
      customs_declaration: s0.declaration_ref ? `${s0.declaration_ref} on ${d(s0.declaration_date)}` : "not submitted yet",
      customs_status_confirmed_by_a_person: s0.customs_status, customs_reason: s0.customs_reason,
      clear2ship_never_says_compliant: "Clear2Ship checks paperwork only; it can't say a shipment is compliant.",
      recent_timeline: bundle.events.slice(0, 8).map((e) => `${e.actor_role}: ${e.action}`),
    };

    const answer = await answerAboutShipment(message, facts)
      ?? `I can't answer that from what I know about ${id}. The next step is: ${s0.pending_action ?? "none"}. You can also ask your freight forwarder.`;
    await save(id, "app", answer);
    return { shipmentId: id, reply: answer, complete: true };
  }

  const { raw: newRaw, rejected, derived } = applyExtraction(oldRaw, ex);
  let changes: string[] = [];
  if (hasFields) {
    try {
      ({ changes } = await updateBooking(id, newRaw, actor, "Changed in chat"));
    } catch (e) {
      const reply = e instanceof Error ? e.message : "That change couldn't be saved.";
      await save(id, "app", reply);
      return { shipmentId: id, reply, complete: true };
    }
  }

  const missing = missingFields(newRaw, state);
  const parts: string[] = [];
  if (changes.length && (state.confirmed || state.awaitingConfirm)) parts.push(`Updated: ${changes.join("; ")}.`);
  parts.push(...derived, ...rejected);
  let result: FullCheck | undefined;

  if (missing.length) {
    state.awaitingConfirm = false;
    const ask = missing.slice(0, 3);
    const question = ask.length === 1
      ? `Could you tell me ${ask[0].ask}?`
      : `Could you tell me:\n${ask.map((m, i) => `${i + 1}) ${m.ask}`).join("\n")}`;
    parts.push((parts.length || changes.length ? "" : "Thanks! ") + question);
    state.lastQuestion = question;
  } else if (s0.submitted_at && changes.length) {
    // After submit: confirm the change and say what it means for the carrier and the delivery slot.
    const after = (await getShipment(id))!;
    result = runAllChecks(after);
    parts.push(`I've re-run every check. ${result.overall === "GREEN" ? "All 10 checks still pass." : result.headline}`);
    if (after.shipment.carrier_status === "requested" && s0.carrier_status === "confirmed") {
      parts.push(`Because the load changed, ${after.shipment.selected_carrier} has been asked to confirm the collection again${s0.appointment_status === "confirmed" ? ", and the delivery slot will be requested again once they do" : ""}.`);
    }
    parts.push(`Next step: ${after.shipment.pending_action ?? "none"}.`);
  } else if (isYes || (state.confirmed && changes.length)) {
    state.confirmed = true;
    state.awaitingConfirm = false;
    state.lastQuestion = null;
    result = runAllChecks((await getShipment(id))!);
    if (changes.length && !isYes) parts.push("I've re-run every check and the carrier choice:");
    const summary = await explainResult(result);
    if (summary) parts.push(summary);
    parts.push(resultText(result));
    parts.push("Next: on the shipment page, choose your carrier, upload the commercial invoice and packing list, fill in any missing document details, then press Submit booking. You can keep chatting here to change anything or ask a question.");
    if (isYes) await logEvent(id, actor, "Confirmed the booking details in chat");
  } else if (state.confirmed) {
    parts.push("Got it. Is there anything else you'd like to change? Otherwise, upload the documents on the shipment page and press Submit booking.");
  } else if (isNo && !changes.length) {
    parts.push("No problem. What should I change?");
  } else {
    state.awaitingConfirm = true;
    state.lastQuestion = "Is this correct?";
    parts.push(`Here's what I have:\n${summaryText(newRaw)}\n\nIs this correct?`);
  }

  await q("UPDATE shipments SET chat_state = $2 WHERE id = $1", [id, JSON.stringify(state)]);
  const reply = parts.filter(Boolean).join("\n\n");
  await save(id, "app", reply);
  return { shipmentId: id, reply, complete: missing.length === 0, result };
}
