// T10 and the chat rules of section 3 (code side only; Gemini's reading is replaced by fixed field values).
import { describe, expect, it } from "vitest";
import { applyExtraction, fillFromAllowedWords, missingFields, type ChatState } from "../src/lib/chat";
import type { ChatExtraction } from "../src/lib/gemini";
import { checkBooking } from "../src/lib/rules/rules";
import { diffBookings } from "../src/lib/shipments";
import type { RawBooking } from "../src/lib/rules/types";

const TODAY = "2026-10-25";
const state = (p: Partial<ChatState> = {}): ChatState => ({ unknown: [], awaitingConfirm: false, confirmed: true, lastQuestion: null, ...p });
const ex = (booking: Record<string, string>, items: Record<string, string>[] = []): ChatExtraction => ({
  booking: Object.fromEntries(Object.entries(booking).map(([k, v]) => [k, { value: v, source: v }])),
  items: items.map((it) => Object.fromEntries(Object.entries(it).map(([k, v]) => [k, { value: v, source: v }]))),
  unknown: [],
});

const T1: RawBooking = {
  seller_name: "Northfield Goods", origin_city: "Manchester", origin_country: "United Kingdom",
  destination_city: "Frankfurt", destination_country: "Germany", destination_type: "Warehouse",
  ready_date: "05-11-2026", seller_priority: "Cheapest", pallets: 3, cartons: 90, declared_value: 5400,
  gross_weight_kg: 620, appointment_booked: "Yes",
  items: [{ sku: "MUG-01", description: "Ceramic coffee mug, 350 ml", hs_code: "691200", quantity: 1080, unit_price: 5,
    units_per_carton: 12, cartons: 90, unit_weight_kg: 0.5, country_of_origin: "United Kingdom" }],
};

describe("T10 and chat rules", () => {
  it('T10: change "3 pallets" to "4 pallets" → all checks and the price update (A: £720)', () => {
    const before = checkBooking(T1, { today: TODAY });
    expect(before.carrier?.pick).toMatchObject({ name: "Carrier A", price: 540 });

    const { raw } = applyExtraction(T1, ex({ pallets: "4" }));
    expect(diffBookings(T1, raw)).toEqual(["Pallets: 3 → 4"]);
    const after = checkBooking(raw, { today: TODAY });
    expect(after.overall).toBe("GREEN");
    expect(after.carrier?.pick).toMatchObject({ name: "Carrier A", price: 720, transitDays: 5 });
    expect(after.headline).toBe("Passed all 10 checks. Recommended: Carrier A, £720, 5 days. Next: confirm to book collection.");
  });

  it("asks at most 3 things, in the fixed order, and never what was already given", () => {
    const { raw } = applyExtraction({ items: [] }, ex({ destination_city: "Paris", pallets: "2" }));
    expect(raw.destination_country).toBe("France");
    const missing = missingFields(raw, state({ confirmed: false }));
    expect(missing.slice(0, 3).map((m) => m.key)).toEqual(["seller_name", "origin_city", "destination_type"]);
    expect(missing.map((m) => m.key)).not.toContain("pallets");
    expect(missing.map((m) => m.key)).not.toContain("destination_city");
  });

  it('a value outside the allowed list (e.g. "Munich") is not saved and the seller is asked to choose', () => {
    const { raw, rejected } = applyExtraction({ items: [] }, ex({ destination_country: "Germany", destination_city: "Munich" }));
    expect(raw.destination_city).toBeUndefined();
    expect(rejected).toEqual(["Munich isn't supported. Choose one of: Berlin, Frankfurt, Hamburg."]);
  });

  it("fields the seller says they don't know are not asked again", () => {
    const raw = { ...T1, items: [{ ...T1.items![0], hs_code: null }] };
    expect(missingFields(raw, state()).map((m) => m.key)).toEqual(["hs_code"]);
    expect(missingFields(raw, state({ unknown: ["hs_code"] }))).toEqual([]);
  });

  it("items are merged by SKU", () => {
    const { raw } = applyExtraction(T1, ex({}, [{ sku: "mug-01", quantity: "1,000" }]));
    expect(raw.items).toHaveLength(1);
    expect(raw.items![0].quantity).toBe(1000);
  });
});

describe("short answers to the app's question", () => {
  const q = "Could you tell me:\n1) your business name\n2) the destination city (Amsterdam, Rotterdam)\n3) whether it's going to a warehouse or a business address";
  const raw = { destination_country: "Netherlands", items: [] } as unknown as RawBooking;
  const fromGemini = { booking: { seller_name: { value: "SouthAsian Foods", source: "SouthAsian Foods" } }, items: [], unknown: [] };

  it("keeps the city and type the seller typed, even if Gemini missed them", () => {
    const ex = fillFromAllowedWords("SouthAsian Foods, Rotterdam, Warehouse", q, raw, fromGemini);
    expect(ex.booking.destination_city?.value).toBe("Rotterdam");
    expect(ex.booking.destination_type?.value).toBe("Warehouse");
    expect(ex.booking.seller_name?.value).toBe("SouthAsian Foods");
  });

  it("only fills what was just asked, and never a value already saved", () => {
    expect(fillFromAllowedWords("from my warehouse in Leeds", "Could you tell me the date it's ready to ship (DD-MM-YYYY)?", raw, { booking: {}, items: [], unknown: [] }).booking).toEqual({});
    const saved = { ...raw, destination_city: "Amsterdam" } as unknown as RawBooking;
    expect(fillFromAllowedWords("Rotterdam", q, saved, { booking: {}, items: [], unknown: [] }).booking.destination_city).toBeUndefined();
  });

  it("doesn't pick when two choices are named", () => {
    expect(fillFromAllowedWords("Amsterdam or Rotterdam, not sure", q, raw, { booking: {}, items: [], unknown: [] }).booking.destination_city).toBeUndefined();
  });
});
