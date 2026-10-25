import type { DestinationType, Priority } from "./constants";

export type Severity = "RED" | "AMBER";
export type Owner = "seller" | "warehouse" | "forwarder";

/** One problem shown to people. Input checks use kind ERROR/WARNING (section 4); rules use RED/AMBER. */
export type Issue = {
  code: string;            // INPUT, R-01..R-10, D-01..D-05, PRIORITY, WAREHOUSE
  kind: "ERROR" | "WARNING" | "RED" | "AMBER";
  severity: Severity;      // ERROR → RED, WARNING → AMBER (for status and alerts)
  key: string;             // stable id so a re-check can tell if the same problem is still open
  message: string;
  fix: string;
  owner: Owner;
  /** For document mismatches (D-02..D-05): both values, so the seller can pick which one is right. */
  compare?: MismatchInfo;
  /** A one-click fix the seller can choose to apply (never applied automatically). */
  suggestion?: { sku?: string; field: string; value: string | number; label: string };
};

export type MismatchInfo = {
  what: string;                 // "Quantity", "Total value", "Cartons", "Gross weight"
  unit: "units" | "GBP" | "cartons" | "kg";
  docKind: DocKind;
  docField: "total_quantity" | "total_value" | "total_cartons" | "gross_weight_kg";
  bookingValue: number;
  docValue: number;
  docSource: string | null;     // the exact words read from the document
  correctedBySeller: boolean;   // the document value was already corrected by the seller
  /** Where "the document is right" writes in the booking; null when it can't be done in one step (several items). */
  bookingTarget: { field: string; sku?: string } | null;
};

/** Values as typed or imported: text, numbers, dates or blanks. */
export type RawItem = Record<string, unknown> & { sku?: unknown };
export type RawBooking = Record<string, unknown> & { items?: RawItem[] };

export type Item = {
  sku: string;
  description: string;
  hs_code: string | null;
  quantity: number;
  unit_price: number;
  units_per_carton: number;
  cartons: number;
  unit_weight_kg: number;
  country_of_origin: string | null;
};

export type Booking = {
  id: string | null;
  seller_name: string;
  origin_city: string;
  origin_country: string;
  destination_country: string;
  destination_city: string;
  destination_type: DestinationType;
  ready_date: string; // YYYY-MM-DD
  seller_priority: Priority | null;
  pallets: number;
  cartons: number;
  declared_value: number;
  currency: string;
  gross_weight_kg: number;
  appointment_booked: boolean | null;
  preferred_carrier: string | null;
  items: Item[];
};

/** Partially filled booking: each field is a clean value or null (blank or invalid). */
export type PartialBooking = { [K in keyof Omit<Booking, "items">]: Booking[K] | null } & {
  items: { [K in keyof Item]: Item[K] | null }[];
};

export type CarrierOption = {
  name: string;
  service: string;
  price: number;
  transitDays: number;
  onTimePct: number;
  maxKgPerPallet: number;
  score?: number;
};

export type CarrierResult = {
  weightPerPallet: number;
  priorityUsed: Priority;
  priorityMissing: boolean;
  pick: CarrierOption | null;
  reason: string;
  alternatives: CarrierOption[];
  removed: string[];
  noneFits: boolean;
  minPalletsNeeded: number;
};

export type Overall = "RED" | "AMBER" | "GREEN";

export type CheckResult = {
  overall: Overall;
  headline: string;
  inputBlocked: boolean;        // input ERRORs stopped the 10 rules from running
  issues: Issue[];              // input problems + R-01..R-10 (+ priority note)
  notes: string[];              // linked-issue notes
  carrier: CarrierResult | null;
  disclaimer: string;
  booking: PartialBooking;
};

export type DocKind = "commercial_invoice" | "packing_list";
export type ExtractedField<T = unknown> = { value: T | null; source: string | null };
export type ExtractedDoc = Record<string, ExtractedField | ExtractedField[] | Record<string, ExtractedField>[] | undefined>;
export type DocInfo = { kind: DocKind; extracted: ExtractedDoc | null; confirmed: boolean };
