// Excel upload: the Bookings and Items sheets of the template (fixtures/bookings_template.xlsx).
// No AI here: columns are read by their header names.
import ExcelJS from "exceljs";
import type { RawBooking, RawItem } from "./rules/types";

const BOOKING_HEADERS: Record<string, string> = {
  "booking id": "id",
  "seller name": "seller_name",
  "origin city": "origin_city",
  "origin country": "origin_country",
  "destination city": "destination_city",
  "destination country": "destination_country",
  "destination type": "destination_type",
  "ready to ship date": "ready_date",
  "seller priority": "seller_priority",
  pallets: "pallets",
  cartons: "cartons",
  "total declared value": "declared_value",
  currency: "currency",
  "total gross weight (kg)": "gross_weight_kg",
  "delivery appointment booked": "appointment_booked",
};
const ITEM_HEADERS: Record<string, string> = {
  "booking id": "booking_id",
  sku: "sku",
  description: "description",
  "hs code": "hs_code",
  "quantity (units)": "quantity",
  "unit price": "unit_price",
  "units per carton": "units_per_carton",
  cartons: "cartons",
  "unit weight (kg)": "unit_weight_kg",
  "country of origin": "country_of_origin",
};

function cellValue(v: ExcelJS.CellValue): unknown {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    if ("result" in v) return cellValue(v.result as ExcelJS.CellValue);
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("text" in v) return (v as { text: string }).text;
    return null;
  }
  return v;
}

/** Rows of a sheet as objects keyed by our field names. Finds the header row (the one with "Booking ID"). */
function readSheet(ws: ExcelJS.Worksheet, headers: Record<string, string>) {
  let headerRow = 0;
  const map = new Map<number, string>();
  for (let r = 1; r <= Math.min(10, ws.rowCount) && !headerRow; r++) {
    ws.getRow(r).eachCell((cell, col) => {
      const key = String(cellValue(cell.value) ?? "").trim().toLowerCase();
      if (key === "booking id") headerRow = r;
      if (headers[key]) map.set(col, headers[key]);
    });
    if (!headerRow) map.clear();
  }
  if (!headerRow) return null;
  const rows: { row: number; data: Record<string, unknown> }[] = [];
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const data: Record<string, unknown> = {};
    let any = false;
    for (const [col, field] of map) {
      const v = cellValue(ws.getRow(r).getCell(col).value);
      data[field] = typeof v === "string" ? v.trim() : v;
      if (v !== null && String(v).trim() !== "") any = true;
    }
    if (any) rows.push({ row: r, data });
  }
  return rows;
}

export type ExcelParse = { bookings: RawBooking[]; warnings: string[]; errors: string[] };

export async function parseBookingsWorkbook(buffer: ArrayBuffer): Promise<ExcelParse> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const errors: string[] = [];
  const warnings: string[] = [];
  const bSheet = wb.getWorksheet("Bookings");
  const iSheet = wb.getWorksheet("Items");
  if (!bSheet) errors.push('The file has no "Bookings" sheet. Please use the Clear2Ship template.');
  if (!iSheet) errors.push('The file has no "Items" sheet. Please use the Clear2Ship template.');
  if (errors.length) return { bookings: [], warnings, errors };

  const bRows = readSheet(bSheet!, BOOKING_HEADERS);
  const iRows = readSheet(iSheet!, ITEM_HEADERS);
  if (!bRows) errors.push('Couldn\'t find the header row (with "Booking ID") on the Bookings sheet.');
  if (!iRows) errors.push('Couldn\'t find the header row (with "Booking ID") on the Items sheet.');
  if (errors.length) return { bookings: [], warnings, errors };

  const bookings: RawBooking[] = [];
  const byId = new Map<string, RawBooking>();
  for (const { row, data } of bRows!) {
    const id = String(data.id ?? "").trim();
    if (!id) { errors.push(`Bookings row ${row}: Booking ID is missing. Please enter it.`); continue; }
    if (byId.has(id)) { errors.push(`Bookings row ${row}: Booking ID ${id} appears twice.`); continue; }
    const b: RawBooking = { ...data, id, items: [] };
    byId.set(id, b);
    bookings.push(b);
  }
  for (const { data } of iRows!) {
    const { booking_id, ...item } = data;
    const id = String(booking_id ?? "").trim();
    const target = byId.get(id);
    if (!target) {
      warnings.push(`Item ${item.sku ?? "(no SKU)"} refers to booking ${id || "(blank)"}, which doesn't exist.`);
      continue;
    }
    target.items!.push(item as RawItem);
  }
  return { bookings, warnings, errors };
}
