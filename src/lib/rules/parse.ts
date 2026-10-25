// Section 4: input checks. Turns raw values into clean ones and lists ERRORs / WARNINGs.
// Nothing here guesses: a blank or unreadable value becomes null plus a message.
import {
  ALL_DESTINATION_CITIES, BOOKING_LABELS, CURRENCIES, DESTINATIONS, DESTINATION_COUNTRIES,
  DESTINATION_TYPES, ITEM_LABELS, ITEM_ORIGINS, ORIGIN_CITIES, ORIGIN_COUNTRY, PRIORITIES,
  type BookingField, type ItemField,
} from "./constants";
import type { Issue, PartialBooking, RawBooking, RawItem } from "./types";

const isBlank = (v: unknown) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");

/** "£5,400" / "GBP 5,400.00" → 5400, "620 kg" → 620. Returns NaN if it still isn't a number. */
export function cleanNumber(v: unknown): number {
  if (typeof v === "number") return v;
  const s = String(v).trim().toLowerCase().replace(/[£,\s]/g, "")
    .replace(/^gbp/, "").replace(/(gbp|kgs?|kilograms?|pallets?|cartons?|units?|pcs)$/g, "");
  if (s === "" || !/^-?\d*\.?\d+$/.test(s)) return NaN;
  return Number(s);
}

/** Accepts DD-MM-YYYY (also with / or .), an ISO date, or a Date. Returns YYYY-MM-DD or null. */
export function parseDate(v: unknown): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) {
    return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, "0")}-${String(v.getUTCDate()).padStart(2, "0")}`;
  }
  const s = String(v).trim();
  let d: number, m: number, y: number;
  let match = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (match) [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else if ((match = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export const toDisplayDate = (iso: string) => iso.split("-").reverse().join("-");

export function matchAllowed(v: unknown, list: readonly string[]): string | null {
  const s = String(v).trim().toLowerCase();
  return list.find((x) => x.toLowerCase() === s) ?? null;
}

export function parseYesNo(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  const s = String(v).trim().toLowerCase();
  if (["yes", "y", "true"].includes(s)) return true;
  if (["no", "n", "false"].includes(s)) return false;
  return null;
}

/** HS codes: digits only. Excel numbers (691200.0) become "691200"; dots and spaces are removed. */
export function cleanHsCode(v: unknown): string | null | "invalid" {
  if (isBlank(v)) return null;
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : "invalid";
  const s = String(v).replace(/[\s.]/g, "");
  return /^\d+$/.test(s) ? s : "invalid";
}

type Ctx = { issues: Issue[] };

const err = (ctx: Ctx, key: string, message: string, fix = message): void => {
  ctx.issues.push({ code: "INPUT", kind: "ERROR", severity: "RED", key: `INPUT:${key}`, message, fix, owner: "seller" });
};

function requiredText(ctx: Ctx, key: string, label: string, v: unknown): string | null {
  if (isBlank(v)) { err(ctx, key, `${label} is missing. Please enter it.`); return null; }
  return String(v).trim();
}

function requiredAllowed(ctx: Ctx, key: string, label: string, v: unknown, list: readonly string[]): string | null {
  if (isBlank(v)) { err(ctx, key, `${label} is missing. Please enter it.`); return null; }
  const hit = matchAllowed(v, list);
  if (!hit) err(ctx, key, `${String(v).trim()} isn't supported. Choose one of: ${list.join(", ")}.`);
  return hit;
}

function requiredNumber(ctx: Ctx, key: string, label: string, v: unknown, whole: boolean): number | null {
  if (isBlank(v)) { err(ctx, key, `${label} is missing. Please enter it.`); return null; }
  const n = cleanNumber(v);
  if (isNaN(n) || n <= 0) { err(ctx, key, `${label} must be a number above 0.`); return null; }
  if (whole && !Number.isInteger(n)) { err(ctx, key, `${label} must be a whole number.`); return null; }
  return n;
}

export function parseBooking(raw: RawBooking): { booking: PartialBooking; issues: Issue[] } {
  const ctx: Ctx = { issues: [] };
  const L = BOOKING_LABELS;
  const f = (k: BookingField) => raw[k];

  const seller_name = requiredText(ctx, "seller_name", L.seller_name, f("seller_name"));
  const origin_city = requiredAllowed(ctx, "origin_city", L.origin_city, f("origin_city"), ORIGIN_CITIES);
  const origin_country = isBlank(f("origin_country"))
    ? ORIGIN_COUNTRY // fixed value: only the United Kingdom is allowed
    : requiredAllowed(ctx, "origin_country", L.origin_country, f("origin_country"), [ORIGIN_COUNTRY]);

  const destination_country = requiredAllowed(ctx, "destination_country", L.destination_country, f("destination_country"), DESTINATION_COUNTRIES);
  const cityList = destination_country ? DESTINATIONS[destination_country] : ALL_DESTINATION_CITIES;
  const destination_city = requiredAllowed(ctx, "destination_city", L.destination_city, f("destination_city"), cityList);

  const destination_type = requiredAllowed(ctx, "destination_type", L.destination_type, f("destination_type"), DESTINATION_TYPES) as PartialBooking["destination_type"];

  let ready_date: string | null = null;
  if (isBlank(f("ready_date"))) err(ctx, "ready_date", `${L.ready_date} is missing. Please enter it.`);
  else if (!(ready_date = parseDate(f("ready_date")))) err(ctx, "ready_date", "Please enter the date as DD-MM-YYYY.");

  // Priority may be blank: the carrier step then uses Balanced and shows an AMBER note (section 6).
  let seller_priority: PartialBooking["seller_priority"] = null;
  if (!isBlank(f("seller_priority"))) {
    seller_priority = matchAllowed(f("seller_priority"), PRIORITIES) as PartialBooking["seller_priority"];
    if (!seller_priority) err(ctx, "seller_priority", `${String(f("seller_priority")).trim()} isn't supported. Choose one of: ${PRIORITIES.join(", ")}.`);
  }

  const pallets = requiredNumber(ctx, "pallets", L.pallets, f("pallets"), true);
  const cartons = requiredNumber(ctx, "cartons", L.cartons, f("cartons"), true);
  const declared_value = requiredNumber(ctx, "declared_value", L.declared_value, f("declared_value"), false);
  const gross_weight_kg = requiredNumber(ctx, "gross_weight_kg", L.gross_weight_kg, f("gross_weight_kg"), false);

  const currency = isBlank(f("currency")) ? "GBP" : requiredAllowed(ctx, "currency", L.currency, f("currency"), CURRENCIES);

  // Only asked (and required) when the destination is a warehouse.
  let appointment_booked: boolean | null = null;
  if (destination_type === "Warehouse") {
    if (isBlank(f("appointment_booked"))) err(ctx, "appointment_booked", `${L.appointment_booked} is missing. Please enter it.`);
    else if ((appointment_booked = parseYesNo(f("appointment_booked"))) === null)
      err(ctx, "appointment_booked", `${String(f("appointment_booked")).trim()} isn't supported. Choose one of: Yes, No.`);
  } else if (!isBlank(f("appointment_booked"))) {
    appointment_booked = parseYesNo(f("appointment_booked"));
  }

  const rawItems = raw.items ?? [];
  if (rawItems.length === 0) err(ctx, "items", "Add at least one item.");
  const items = rawItems.map((it, i) => parseItem(ctx, it, i));

  return {
    booking: {
      id: isBlank(raw.id) ? null : String(raw.id).trim(),
      seller_name, origin_city, origin_country, destination_country, destination_city, destination_type,
      ready_date, seller_priority, pallets, cartons, declared_value, currency, gross_weight_kg,
      appointment_booked,
      preferred_carrier: isBlank(raw.preferred_carrier) ? null : String(raw.preferred_carrier).trim(),
      items,
    },
    issues: ctx.issues,
  };
}

function parseItem(ctx: Ctx, it: RawItem, index: number) {
  const L = ITEM_LABELS;
  const g = (k: ItemField) => it[k];
  const sku = isBlank(g("sku")) ? null : String(g("sku")).trim();
  const who = sku ?? `Item ${index + 1}`;
  const k = (field: string) => `item:${sku ?? index}:${field}`;
  if (!sku) err(ctx, k("sku"), `${who}: ${L.sku} is missing. Please enter it.`);

  const description = requiredText(ctx, k("description"), `${who}: ${L.description}`, g("description"));

  // HS code may be blank (then R-01 fails). 5 digits → WARNING about a lost leading zero.
  let hs_code: string | null = null;
  const hs = cleanHsCode(g("hs_code"));
  if (hs === "invalid") err(ctx, k("hs_code"), `${who}: HS code must contain digits only.`);
  else hs_code = hs;
  if (hs_code && hs_code.length === 5) {
    ctx.issues.push({
      code: "INPUT", kind: "WARNING", severity: "AMBER", key: `INPUT:${k("hs_code_zero")}`, owner: "seller",
      message: `${who}: HS code may have lost a leading zero (e.g. ${hs_code} → 0${hs_code}). Please confirm.`,
      fix: `If the code is 0${hs_code}, use the button to change it.`,
      suggestion: { sku: sku ?? undefined, field: "hs_code", value: `0${hs_code}`, label: `Use 0${hs_code}` },
    });
  }

  const quantity = requiredNumber(ctx, k("quantity"), `${who}: ${L.quantity}`, g("quantity"), true);
  const units_per_carton = requiredNumber(ctx, k("units_per_carton"), `${who}: ${L.units_per_carton}`, g("units_per_carton"), true);
  const cartons = requiredNumber(ctx, k("cartons"), `${who}: ${L.cartons}`, g("cartons"), true);
  const unit_price = requiredNumber(ctx, k("unit_price"), `${who}: ${L.unit_price}`, g("unit_price"), false);
  const unit_weight_kg = requiredNumber(ctx, k("unit_weight_kg"), `${who}: ${L.unit_weight_kg}`, g("unit_weight_kg"), false);

  // Country of origin may be blank (then R-09 warns), but must be from the list when given.
  let country_of_origin: string | null = null;
  if (!isBlank(g("country_of_origin"))) {
    country_of_origin = matchAllowed(g("country_of_origin"), ITEM_ORIGINS);
    if (!country_of_origin) err(ctx, k("country_of_origin"), `${String(g("country_of_origin")).trim()} isn't supported. Choose one of: ${ITEM_ORIGINS.join(", ")}.`);
  }

  return { sku, description, hs_code, quantity, unit_price, units_per_carton, cartons, unit_weight_kg, country_of_origin };
}
