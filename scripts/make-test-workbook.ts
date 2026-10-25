// Builds fixtures/test_cases.xlsx from the template: T1–T9 from clear2ship_rules.md section 8 as
// bookings TC-01..TC-09, plus TC-ERR (input errors) and an item pointing at a missing booking.
// Usage: npx tsx scripts/make-test-workbook.ts
import ExcelJS from "exceljs";

const base = {
  seller: "Northfield Goods", origin: "Manchester", originCountry: "United Kingdom", city: "Frankfurt", country: "Germany",
  type: "Warehouse", date: "05-11-2026", priority: "Cheapest", pallets: 3, cartons: 90, value: 5400, currency: "GBP",
  weight: 620, appt: "Yes",
};
const mug = { sku: "MUG-01", desc: "Ceramic coffee mug, 350 ml", hs: 691200, qty: 1080, price: 5, upc: 12, cartons: 90, kg: 0.5, origin: "United Kingdom" };

const cases: { id: string; b?: Partial<typeof base>; i?: Partial<typeof mug> }[] = [
  { id: "TC-01" },                                  // T1 GREEN, A £540
  { id: "TC-02", b: { priority: "Fastest" } },      // T2 C £1,020
  { id: "TC-03", b: { priority: "Balanced" } },     // T3 B £660
  { id: "TC-04", b: { weight: 1300, pallets: 2 } }, // T4 B only
  { id: "TC-05", b: { weight: 1600, pallets: 2 } }, // T5 R-05
  { id: "TC-06", i: { hs: 90111 } },                // T6 R-01 + leading zero
  { id: "TC-07", b: { value: 6000 } },              // T7 R-02
  { id: "TC-08", i: { desc: "Power bank 10000mAh" } }, // T8 R-06
  { id: "TC-09", b: { appt: "No" } },               // T9 R-08 AMBER
  { id: "TC-ERR", b: { city: "Munich", pallets: 2.5 as number } }, // input errors
];

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile("fixtures/bookings_template.xlsx");
  const bs = wb.getWorksheet("Bookings")!;
  const is = wb.getWorksheet("Items")!;
  // Data starts on row 3 (the template's example row is replaced).
  cases.forEach((c, n) => {
    const b = { ...base, ...c.b };
    const i = { ...mug, ...c.i };
    bs.getRow(3 + n).values = [c.id, b.seller, b.origin, b.originCountry, b.city, b.country, b.type, b.date, b.priority,
      b.pallets, b.cartons, b.value, b.currency, b.weight, b.appt];
    is.getRow(3 + n).values = [c.id, i.sku, i.desc, i.hs, i.qty, i.price, i.upc, i.cartons, i.kg, i.origin];
  });
  is.getRow(3 + cases.length).values = ["BK-999", "LOST-01", "Orphan item", 691200, 10, 1, 10, 1, 0.1, "China"];
  await wb.xlsx.writeFile("fixtures/test_cases.xlsx");
  console.log(`Wrote fixtures/test_cases.xlsx with ${cases.length} bookings.`);
}

main();
