// Document checks D-01..D-05 (added at the seller's request, kept separate from R-01..R-10).
// They compare the booking with the fields the seller confirmed from the invoice and packing list.
import { fmt, money } from "./format";
import { cleanNumber } from "./parse";
import type { DocInfo, DocKind, ExtractedDoc, ExtractedField, Issue, MismatchInfo, PartialBooking } from "./types";

export const DOC_LABEL: Record<DocKind, string> = {
  commercial_invoice: "commercial invoice",
  packing_list: "packing list",
};
export const REQUIRED_DOCS: DocKind[] = ["commercial_invoice", "packing_list"];

/** Fields Gemini reads from each document (totals, and per item line). */
export const DOC_FIELDS: Record<DocKind, { totals: string[]; item: string[] }> = {
  commercial_invoice: {
    totals: ["seller_name", "seller_address", "exporter_eori", "buyer_name", "buyer_address", "invoice_number", "invoice_date",
      "incoterms", "reason_for_export", "total_value", "currency", "total_quantity"],
    item: ["sku", "description", "hs_code", "quantity", "unit_price", "line_total", "country_of_origin"],
  },
  packing_list: {
    totals: ["total_pallets", "total_cartons", "gross_weight_kg", "net_weight_kg", "total_quantity"],
    item: ["sku", "description", "quantity", "cartons", "units_per_carton", "weight_kg", "carton_dimensions_cm", "carton_gross_weight_kg"],
  },
};

// Document checks are warnings: they show what's missing or doesn't match, but never stop the shipment.
// Only the booking details and the rulebook (R-01..R-10) block. `level` says how serious the gap is in words.
const d = (code: string, _level: "RED" | "AMBER", key: string, message: string, fix: string, compare?: MismatchInfo): Issue =>
  ({ code, kind: "WARNING", severity: "AMBER", key: `${code}:${key}`, message, fix, owner: "seller", compare });

/** The exact words a value was read from, and whether the seller has corrected it. */
function sourceOf(doc: ExtractedDoc | null, field: string) {
  const f = doc?.[field] as (ExtractedField & { corrected_by_seller?: boolean }) | undefined;
  return { docSource: f?.source ?? null, correctedBySeller: !!f?.corrected_by_seller };
}

/** Read a number from an extracted field; null when Gemini didn't find it. */
function num(doc: ExtractedDoc | null, field: string): number | null {
  const f = doc?.[field] as ExtractedField | undefined;
  if (!f || f.value === null || f.value === undefined || f.value === "") return null;
  const n = cleanNumber(f.value);
  return isNaN(n) ? null : n;
}

/** Total quantity on a document: its stated total, otherwise the sum of its item lines. */
function docQuantity(doc: ExtractedDoc | null): number | null {
  const total = num(doc, "total_quantity");
  if (total !== null) return total;
  const items = (doc?.items ?? []) as Record<string, ExtractedField>[];
  const qtys = items.map((i) => (i.quantity?.value == null ? NaN : cleanNumber(i.quantity.value)));
  if (qtys.length === 0 || qtys.some(isNaN)) return null;
  return qtys.reduce((a, b) => a + b, 0);
}

export function checkDocuments(b: PartialBooking, docs: DocInfo[]): Issue[] {
  const issues: Issue[] = [];
  const byKind = (k: DocKind) => docs.find((x) => x.kind === k);

  for (const kind of REQUIRED_DOCS) {
    const doc = byKind(kind);
    if (!doc) {
      issues.push(d("D-01", "RED", kind, `The ${DOC_LABEL[kind]} hasn't been uploaded.`, `Upload the ${DOC_LABEL[kind]} for this shipment.`));
    } else if (!doc.confirmed) {
      issues.push(d("D-01", "AMBER", `${kind}:confirm`, `The fields read from the ${DOC_LABEL[kind]} haven't been confirmed yet.`, `Open the ${DOC_LABEL[kind]}, check the fields and press Confirm.`));
    }
  }

  const invoice = byKind("commercial_invoice");
  const packing = byKind("packing_list");
  const inv = invoice?.confirmed ? invoice.extracted : null;
  const pl = packing?.confirmed ? packing.extracted : null;

  const bookingQty = b.items.every((i) => i.quantity !== null)
    ? b.items.reduce((s, i) => s + (i.quantity ?? 0), 0) : null;

  // D-02 quantity
  for (const [kind, doc] of [["commercial_invoice", inv], ["packing_list", pl]] as const) {
    const q = docQuantity(doc);
    if (doc && q !== null && bookingQty !== null && q !== bookingQty) {
      const one = b.items.length === 1 && b.items[0].sku;
      issues.push(d("D-02", "RED", kind, `Quantity doesn't match: the booking says ${fmt(bookingQty)} units, the ${DOC_LABEL[kind]} says ${fmt(q)}.`,
        `Correct the booking items, or upload the right ${DOC_LABEL[kind]}.`, {
          what: "Quantity", unit: "units", docKind: kind, docField: "total_quantity", bookingValue: bookingQty, docValue: q,
          ...sourceOf(doc, "total_quantity"), bookingTarget: one ? { field: "quantity", sku: b.items[0].sku! } : null,
        }));
    }
  }

  // D-03 value (invoice)
  const invValue = num(inv, "total_value");
  if (invValue !== null && b.declared_value !== null && Math.abs(invValue - b.declared_value) > 0.005) {
    issues.push(d("D-03", "RED", "value", `Value doesn't match: the booking says ${money(b.declared_value)}, the commercial invoice says ${money(invValue)}.`,
      "Correct the declared value, or upload the right invoice.", {
        what: "Total value", unit: "GBP", docKind: "commercial_invoice", docField: "total_value", bookingValue: b.declared_value, docValue: invValue,
        ...sourceOf(inv, "total_value"), bookingTarget: { field: "declared_value" },
      }));
  }

  // D-04 cartons (packing list)
  const plCartons = num(pl, "total_cartons");
  if (plCartons !== null && b.cartons !== null && plCartons !== b.cartons) {
    issues.push(d("D-04", "RED", "cartons", `Cartons don't match: the booking says ${fmt(b.cartons)}, the packing list says ${fmt(plCartons)}.`,
      "Correct the booking cartons, or upload the right packing list.", {
        what: "Cartons", unit: "cartons", docKind: "packing_list", docField: "total_cartons", bookingValue: b.cartons, docValue: plCartons,
        ...sourceOf(pl, "total_cartons"), bookingTarget: { field: "cartons" },
      }));
  }

  // D-05 gross weight (packing list) – a warning, like R-07
  const plWeight = num(pl, "gross_weight_kg");
  if (plWeight !== null && b.gross_weight_kg !== null && Math.abs(plWeight - b.gross_weight_kg) > 0.005) {
    issues.push(d("D-05", "AMBER", "weight", `Weight doesn't match: the booking says ${fmt(b.gross_weight_kg)} kg, the packing list says ${fmt(plWeight)} kg.`,
      "Check which weight is right and correct the booking or the packing list.", {
        what: "Gross weight", unit: "kg", docKind: "packing_list", docField: "gross_weight_kg", bookingValue: b.gross_weight_kg, docValue: plWeight,
        ...sourceOf(pl, "gross_weight_kg"), bookingTarget: { field: "gross_weight_kg" },
      }));
  }

  return issues;
}
