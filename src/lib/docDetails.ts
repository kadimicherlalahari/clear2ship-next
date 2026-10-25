// Invoice / packing list details that the booking (template) doesn't fully cover, and the overview
// of everything both documents need. Pure code, safe to use in the browser.
import { parseDate } from "./rules/parse";

export const INCOTERMS = ["EXW", "FCA", "CPT", "CIP", "DAP", "DPU", "DDP"];
export const EXPORT_REASONS = ["Sale", "Sample", "Return", "Repair", "Gift"];

export type DetailField = {
  key: string;
  label: string;
  docs: string;                 // which document(s) need it
  coverage: "partial" | "missing";
  hint?: string;
  options?: string[];
  fromInvoice?: string;         // field name in the invoice extraction that fills it
};

/** Shipment-level details. "partial" = the template has part of it (e.g. city only). */
export const DETAIL_FIELDS: DetailField[] = [
  { key: "exporter_address", label: "Seller (exporter) full address", docs: "Invoice + packing list", coverage: "partial", hint: "Street and postcode. The booking only has the city.", fromInvoice: "seller_address" },
  { key: "exporter_eori", label: "Exporter EORI number", docs: "Invoice", coverage: "missing", hint: "GB followed by 12 digits, e.g. GB123456789000", fromInvoice: "exporter_eori" },
  { key: "buyer_name", label: "Buyer / consignee name", docs: "Invoice + packing list", coverage: "missing", fromInvoice: "buyer_name" },
  { key: "buyer_address", label: "Buyer / consignee full address", docs: "Invoice + packing list", coverage: "partial", hint: "Street and postcode. The booking only has the city and country.", fromInvoice: "buyer_address" },
  { key: "invoice_number", label: "Invoice number", docs: "Invoice + packing list", coverage: "missing", fromInvoice: "invoice_number" },
  { key: "invoice_date", label: "Invoice date", docs: "Invoice", coverage: "missing", hint: "DD-MM-YYYY", fromInvoice: "invoice_date" },
  { key: "incoterms", label: "Incoterms", docs: "Invoice", coverage: "missing", hint: "Code and place, e.g. DAP Lyon (EXW, FCA, CPT, CIP, DAP, DPU, DDP)", fromInvoice: "incoterms" },
  { key: "reason_for_export", label: "Reason for export", docs: "Invoice", coverage: "missing", options: EXPORT_REASONS, fromInvoice: "reason_for_export" },
];

/** Per item (packing list). */
export const ITEM_DETAIL_FIELDS: DetailField[] = [
  { key: "carton_dimensions_cm", label: "Carton size (cm)", docs: "Packing list", coverage: "missing", hint: "Length x width x height, e.g. 40 x 30 x 25" },
  { key: "carton_gross_weight_kg", label: "Gross weight per carton (kg)", docs: "Packing list", coverage: "missing" },
];

export type DetailValue = { value: string; source: string };
export type DocDetails = Record<string, DetailValue | undefined> & { items?: Record<string, Record<string, DetailValue | undefined>> };

/** Check one value. Returns an error message, or null when it's fine. */
export function validateDetail(key: string, raw: string): string | null {
  const v = raw.trim();
  if (!v) return "Please enter a value.";
  switch (key) {
    case "exporter_eori":
      return /^(GB|XI)\d{12}$/.test(v.replace(/\s/g, "").toUpperCase()) ? null : "An EORI number is GB (or XI) followed by 12 digits, e.g. GB123456789000.";
    case "invoice_date":
      return parseDate(v) ? null : "Please enter the date as DD-MM-YYYY.";
    case "incoterms": // the code, optionally followed by the named place, e.g. "DAP Lyon"
      return INCOTERMS.includes(v.split(/\s+/)[0].toUpperCase()) ? null : `${v} isn't supported. Choose one of: ${INCOTERMS.join(", ")} (optionally with the place, e.g. DAP Lyon).`;
    case "reason_for_export":
      return EXPORT_REASONS.some((r) => r.toLowerCase() === v.toLowerCase()) ? null : `${v} isn't supported. Choose one of: ${EXPORT_REASONS.join(", ")}.`;
    case "carton_dimensions_cm": {
      const m = v.replace(/cm/gi, "").trim().match(/^(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)$/i);
      return m && [m[1], m[2], m[3]].every((n) => Number(n) > 0) ? null : "Enter the size as length x width x height in cm, e.g. 40 x 30 x 25.";
    }
    case "carton_gross_weight_kg": {
      const n = Number(v.replace(/kg/i, "").trim());
      return Number.isFinite(n) && n > 0 ? null : "Gross weight per carton must be a number above 0.";
    }
    case "exporter_address":
    case "buyer_address":
      return v.length >= 8 ? null : "Please enter the full address (street, postcode and city).";
  }
  return null;
}

/** Normalised form of a valid value (e.g. EORI in capitals). */
export function normaliseDetail(key: string, raw: string): string {
  const v = raw.trim();
  if (key === "exporter_eori") return v.replace(/\s/g, "").toUpperCase();
  if (key === "incoterms") { const [code, ...place] = v.split(/\s+/); return [code.toUpperCase(), ...place].join(" "); }
  if (key === "reason_for_export") return EXPORT_REASONS.find((r) => r.toLowerCase() === v.toLowerCase()) ?? v;
  if (key === "invoice_date") { const d = parseDate(v); return d ? d.split("-").reverse().join("-") : v; }
  return v;
}

/** Which details are still missing or invalid (shipment-level and per item SKU). */
export function missingDetails(details: DocDetails | null, skus: string[]): { key: string; sku?: string; label: string; error: string }[] {
  const out: { key: string; sku?: string; label: string; error: string }[] = [];
  for (const f of DETAIL_FIELDS) {
    const v = details?.[f.key] as DetailValue | undefined;
    const err = v ? validateDetail(f.key, v.value) : "Missing";
    if (err) out.push({ key: f.key, label: f.label, error: err });
  }
  for (const sku of skus) {
    for (const f of ITEM_DETAIL_FIELDS) {
      const v = details?.items?.[sku]?.[f.key];
      const err = v ? validateDetail(f.key, v.value) : "Missing";
      if (err) out.push({ key: f.key, sku, label: `${sku}: ${f.label}`, error: err });
    }
  }
  return out;
}
