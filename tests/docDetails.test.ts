// Document details (fields the booking template doesn't fully cover): every value is checked before saving.
import { describe, expect, it } from "vitest";
import { missingDetails, normaliseDetail, validateDetail } from "../src/lib/docDetails";

describe("document details", () => {
  it("checks the EORI format", () => {
    expect(validateDetail("exporter_eori", "GB12345")).toMatch(/GB \(or XI\) followed by 12 digits/);
    expect(validateDetail("exporter_eori", "gb 123456789000")).toBeNull();
    expect(normaliseDetail("exporter_eori", "gb 123456789000")).toBe("GB123456789000");
  });

  it("accepts an Incoterm with or without the named place", () => {
    expect(validateDetail("incoterms", "DAP")).toBeNull();
    expect(validateDetail("incoterms", "dap Lyon")).toBeNull();
    expect(normaliseDetail("incoterms", "dap Lyon")).toBe("DAP Lyon");
    expect(validateDetail("incoterms", "FOB")).toMatch(/isn't supported/);
  });

  it("checks dates, carton sizes and weights", () => {
    expect(validateDetail("invoice_date", "26/10/2026")).toBeNull();
    expect(validateDetail("invoice_date", "next week")).toBe("Please enter the date as DD-MM-YYYY.");
    expect(validateDetail("carton_dimensions_cm", "40 x 30 x 25 cm")).toBeNull();
    expect(validateDetail("carton_dimensions_cm", "40 x 30")).toMatch(/length x width x height/);
    expect(validateDetail("carton_gross_weight_kg", "7.5 kg")).toBeNull();
    expect(validateDetail("carton_gross_weight_kg", "0")).toMatch(/above 0/);
  });

  it("lists what is still missing, per shipment and per item", () => {
    const missing = missingDetails({ exporter_eori: { value: "GB123456789000", source: "x" } }, ["MUG-01"]);
    expect(missing.map((m) => m.label)).toContain("Buyer / consignee name");
    expect(missing.map((m) => m.label)).toContain("MUG-01: Carton size (cm)");
    expect(missing.map((m) => m.label)).not.toContain("Exporter EORI number");
  });
});
