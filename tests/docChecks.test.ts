// Document checks D-02..D-05 carry both values, so the seller can choose which one is right.
import { describe, expect, it } from "vitest";
import { checkDocuments } from "../src/lib/rules/docs";
import type { DocInfo, PartialBooking } from "../src/lib/rules/types";

const booking = {
  declared_value: 5400, cartons: 90, gross_weight_kg: 620,
  items: [{ sku: "MUG-01", quantity: 1080 }],
} as unknown as PartialBooking;
const f = (value: unknown, source: string) => ({ value, source });
const docs = (pl: Record<string, unknown>): DocInfo[] => [
  { kind: "commercial_invoice", confirmed: true, extracted: { total_value: f("GBP 5,400.00", "GBP 5,400.00"), total_quantity: f("1,080", "1,080 units") } },
  { kind: "packing_list", confirmed: true, extracted: pl as DocInfo["extracted"] },
];

describe("document mismatches", () => {
  it("give both values, the words read, and where the booking would change", () => {
    const issues = checkDocuments(booking, docs({ total_cartons: f("88", "88 cartons"), gross_weight_kg: f("600", "600 kg") }));
    const d04 = issues.find((i) => i.code === "D-04")!;
    expect(d04.compare).toMatchObject({ what: "Cartons", bookingValue: 90, docValue: 88, docSource: "88 cartons", correctedBySeller: false, bookingTarget: { field: "cartons" } });
    expect(issues.find((i) => i.code === "D-05")!.compare).toMatchObject({ bookingValue: 620, docValue: 600, docKind: "packing_list" });
  });

  it("a value corrected by the seller is used and marked", () => {
    const issues = checkDocuments(booking, docs({ total_cartons: { value: "89", source: "Corrected by the seller (read as 88)", corrected_by_seller: true } }));
    expect(issues.find((i) => i.code === "D-04")!.compare).toMatchObject({ docValue: 89, correctedBySeller: true });
    expect(checkDocuments(booking, docs({ total_cartons: { value: "90", source: "x", corrected_by_seller: true } })).filter((i) => i.code === "D-04")).toEqual([]);
  });

  it("quantity with several items can't be changed in one step", () => {
    const two = { ...booking, items: [{ sku: "A", quantity: 500 }, { sku: "B", quantity: 580 }] } as unknown as PartialBooking;
    const pl = docs({ total_quantity: f("1000", "1000 pcs") });
    expect(checkDocuments(two, pl).find((i) => i.code === "D-02")!.compare!.bookingTarget).toBeNull();
  });
});

describe("document checks are warnings only", () => {
  it("missing documents and mismatches never come back RED", () => {
    const missing = checkDocuments(booking, []);
    expect(missing.map((i) => i.code)).toEqual(["D-01", "D-01"]);
    const mismatched = checkDocuments(booking, docs({ total_cartons: f("88", "88 cartons"), gross_weight_kg: f("600", "600 kg") }));
    for (const i of [...missing, ...mismatched]) expect({ kind: i.kind, severity: i.severity }).toEqual({ kind: "WARNING", severity: "AMBER" });
  });
});
