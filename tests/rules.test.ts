// Test cases T1–T9 from clear2ship_rules.md section 8 (T10 is in chat.test.ts).
import { describe, expect, it } from "vitest";
import { checkBooking } from "../src/lib/rules/rules";
import type { RawBooking } from "../src/lib/rules/types";

const TODAY = "2026-10-25";

const T1 = (): RawBooking => ({
  id: "BK-001", seller_name: "Northfield Goods", origin_city: "Manchester", origin_country: "United Kingdom",
  destination_city: "Frankfurt", destination_country: "Germany", destination_type: "Warehouse",
  ready_date: "05-11-2026", seller_priority: "Cheapest", pallets: 3, cartons: 90,
  declared_value: "£5,400", currency: "GBP", gross_weight_kg: "620 kg", appointment_booked: "Yes",
  items: [{
    sku: "MUG-01", description: "Ceramic coffee mug, 350 ml", hs_code: 691200, quantity: "1,080",
    unit_price: 5, units_per_carton: 12, cartons: 90, unit_weight_kg: 0.5, country_of_origin: "United Kingdom",
  }],
});

const codes = (r: ReturnType<typeof checkBooking>) => r.issues.map((i) => `${i.code}/${i.kind}`);

describe("section 8 test cases", () => {
  it("T1: GREEN, Carrier A, £540, 5 days", () => {
    const r = checkBooking(T1(), { today: TODAY });
    expect(r.issues).toEqual([]);
    expect(r.overall).toBe("GREEN");
    expect(r.carrier?.pick).toMatchObject({ name: "Carrier A", price: 540, transitDays: 5 });
    expect(r.headline).toBe("Passed all 10 checks. Recommended: Carrier A, £540, 5 days. Next: confirm to book collection.");
  });

  it("T2: Fastest → Carrier C, £1,020, 2 days", () => {
    const r = checkBooking({ ...T1(), seller_priority: "Fastest" }, { today: TODAY });
    expect(r.overall).toBe("GREEN");
    expect(r.carrier?.pick).toMatchObject({ name: "Carrier C", price: 1020, transitDays: 2 });
  });

  it("T3: Balanced → Carrier B, £660, 3 days", () => {
    const r = checkBooking({ ...T1(), seller_priority: "Balanced" }, { today: TODAY });
    expect(r.carrier?.pick).toMatchObject({ name: "Carrier B", price: 660, transitDays: 3 });
  });

  it("T4: 1,300 kg on 2 pallets → A and C removed (650 kg/pallet), Carrier B only", () => {
    const r = checkBooking({ ...T1(), gross_weight_kg: 1300, pallets: 2 }, { today: TODAY });
    expect(r.carrier?.weightPerPallet).toBe(650);
    expect(r.carrier?.removed).toEqual([
      "Carrier A removed: 650 kg/pallet is over its 500 kg limit.",
      "Carrier C removed: 650 kg/pallet is over its 400 kg limit.",
    ]);
    expect(r.carrier?.pick?.name).toBe("Carrier B");
    expect(r.carrier?.alternatives).toEqual([]);
  });

  it("T5: 1,600 kg on 2 pallets → R-05 RED, use at least 3 pallets", () => {
    const r = checkBooking({ ...T1(), gross_weight_kg: 1600, pallets: 2 }, { today: TODAY });
    const r05 = r.issues.find((i) => i.code === "R-05");
    expect(r05?.severity).toBe("RED");
    expect(r05?.message).toBe("800 kg per pallet is over every carrier's limit. Use at least 3 pallets.");
    expect(r.overall).toBe("RED");
  });

  it("T6: HS code 90111 → R-01 RED + leading zero hint", () => {
    const t = T1();
    t.items![0].hs_code = 90111;
    const r = checkBooking(t, { today: TODAY });
    const r01 = r.issues.find((i) => i.code === "R-01");
    expect(r01?.severity).toBe("RED");
    expect(r01?.message).toBe("MUG-01: HS code '90111' has 5 digits (needs 6+).");
    const hint = r.issues.find((i) => i.kind === "WARNING");
    expect(hint?.message).toBe("MUG-01: HS code may have lost a leading zero (e.g. 90111 → 090111). Please confirm.");
    expect(r.overall).toBe("RED");
  });

  it("T7: declared £6,000 → R-02 RED, items add up to £5,400", () => {
    const r = checkBooking({ ...T1(), declared_value: 6000 }, { today: TODAY });
    expect(codes(r)).toEqual(["R-02/RED"]);
    expect(r.issues[0].message).toBe("Declared £6,000 but items add up to £5,400.");
  });

  it("T8: 'Power bank 10000mAh' → R-06 RED", () => {
    const t = T1();
    t.items![0].description = "Power bank 10000mAh";
    const r = checkBooking(t, { today: TODAY });
    expect(codes(r)).toEqual(["R-06/RED"]);
    expect(r.issues[0].message).toBe("MUG-01 looks like a restricted item.");
  });

  it("T9: no appointment to a warehouse → R-08 AMBER, overall AMBER", () => {
    const r = checkBooking({ ...T1(), appointment_booked: "No" }, { today: TODAY });
    expect(codes(r)).toEqual(["R-08/AMBER"]);
    expect(r.overall).toBe("AMBER");
    expect(r.headline).toBe("Can ship, but 1 item should be checked. Carrier: Carrier A, £540, 5 days.");
  });
});

describe("other rules and input checks", () => {
  it("R-02 and R-03 together add the linked note", () => {
    const t = T1();
    t.items![0].quantity = 1000;
    const r = checkBooking(t, { today: TODAY });
    expect(codes(r)).toEqual(["R-02/RED", "R-03/RED"]);
    expect(r.notes).toEqual(["R-02 is probably caused by the R-03 mistake. Fix that first."]);
  });

  it("exactly 1% passes R-02, just over fails", () => {
    expect(checkBooking({ ...T1(), declared_value: 5454 }, { today: TODAY }).overall).toBe("GREEN");
    expect(checkBooking({ ...T1(), declared_value: 5455 }, { today: TODAY }).overall).toBe("RED");
  });

  it("R-04, R-07, R-09, R-10", () => {
    const t = T1();
    t.cartons = 88; t.gross_weight_kg = 500; t.ready_date = "20-10-2026"; t.items![0].country_of_origin = "";
    const r = checkBooking(t, { today: TODAY });
    expect(codes(r)).toEqual(["R-04/RED", "R-07/AMBER", "R-09/AMBER", "R-10/AMBER"]);
    expect(r.issues[1].owner).toBe("warehouse");
  });

  it("R-06 amber words and 'batteries not included'", () => {
    for (const desc of ["Wireless earbuds", "Toy car (batteries not included)", "Rose perfume 50ml"]) {
      const t = T1(); t.items![0].description = desc;
      expect(codes(checkBooking(t, { today: TODAY }))).toEqual(["R-06/AMBER"]);
    }
    const t = T1(); t.items![0].description = "Spray paint can";
    expect(codes(checkBooking(t, { today: TODAY }))).toEqual(["R-06/RED"]);
  });

  it("missing priority → Balanced + AMBER note", () => {
    const r = checkBooking({ ...T1(), seller_priority: "" }, { today: TODAY });
    expect(r.carrier?.priorityUsed).toBe("Balanced");
    expect(r.carrier?.pick?.name).toBe("Carrier B");
    expect(codes(r)).toEqual(["PRIORITY/AMBER"]);
  });

  it("input errors block the rules and use the exact messages", () => {
    const r = checkBooking({ ...T1(), destination_city: "Munich", pallets: 2.5, ready_date: "5th Nov", seller_name: "" }, { today: TODAY });
    expect(r.inputBlocked).toBe(true);
    expect(r.issues.map((i) => i.message)).toEqual([
      "Seller name is missing. Please enter it.",
      "Munich isn't supported. Choose one of: Berlin, Frankfurt, Hamburg.",
      "Please enter the date as DD-MM-YYYY.",
      "Pallets must be a whole number.",
    ]);
    expect(checkBooking({ ...T1(), items: [] }, { today: TODAY }).issues[0].message).toBe("Add at least one item.");
    expect(checkBooking({ ...T1(), pallets: -1 }, { today: TODAY }).issues[0].message).toBe("Pallets must be a number above 0.");
  });

  it("preferred carrier that doesn't fit → next best with reason", () => {
    const r = checkBooking({ ...T1(), preferred_carrier: "Carrier C", gross_weight_kg: 1300, pallets: 3 }, { today: TODAY });
    expect(r.carrier?.pick?.name).toBe("Carrier A");
    expect(r.carrier?.reason).toMatch(/^Carrier C can't be used \(433.33 kg\/pallet is over its 400 kg limit.\)/);
  });
});
