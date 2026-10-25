"use client";
import { validateDetail, type DetailValue, type DocDetails } from "@/lib/docDetails";
import { Card } from "./ui";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const money = (v: unknown) => `£${Number(v).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (v: unknown, dp = 2) => Number(v).toLocaleString("en-GB", { maximumFractionDigits: dp });

type OvRow = { label: string; value: string | null; source: string };

function OvTable({ title, rows }: { title: string; rows: OvRow[] }) {
  const done = rows.filter((r) => r.value).length;
  return (
    <div>
      <h4 className="mb-1 flex items-center justify-between text-sm font-semibold">{title}<span className="text-xs font-normal text-slate-500">{done} of {rows.length} ready</span></h4>
      <table className="w-full text-sm">
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={r.label}>
              <td className="w-6 py-1.5 align-top">{r.value ? <span className="text-green-600" aria-label="provided">✓</span> : <span className="text-red-600" aria-label="missing">✗</span>}</td>
              <td className="w-48 py-1.5 pr-2 align-top text-slate-600">{r.label}</td>
              <td className="py-1.5 pr-2 align-top font-medium">{r.value ?? <span className="font-normal text-red-700">Missing</span>}</td>
              <td className="hidden py-1.5 align-top text-xs text-slate-500 sm:table-cell">{r.source}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** One place for the booking: key shipment facts, everything both documents need (with sources), and the item lines. */
export function BookingOverview({ shipment: s, items, actions, editor }: { shipment: Row; items: Row[]; actions?: React.ReactNode; editor?: React.ReactNode }) {
  const d = (s.doc_details ?? {}) as DocDetails;
  const det = (k: string): string | null => {
    const v = d[k] as DetailValue | undefined;
    return v && !validateDetail(k, v.value) ? v.value : null;
  };
  const src = (k: string) => (d[k] as DetailValue | undefined)?.source ?? "Needed";
  const netKg = items.reduce((t, i) => t + Number(i.unit_weight_kg ?? 0) * Number(i.quantity ?? 0), 0);
  const B = "Booking";
  const seller = s.seller_name ? `${s.seller_name}${det("exporter_address") ? `, ${det("exporter_address")}` : ""}` : null;
  const buyer = det("buyer_name") ? `${det("buyer_name")}${det("buyer_address") ? `, ${det("buyer_address")}` : ""}` : null;

  const invoice: OvRow[] = [
    { label: "Seller (exporter)", value: s.seller_name, source: B },
    { label: "Seller address", value: det("exporter_address"), source: det("exporter_address") ? src("exporter_address") : `Booking has only ${s.origin_city ?? "?"}, United Kingdom` },
    { label: "Exporter EORI", value: det("exporter_eori"), source: src("exporter_eori") },
    { label: "Buyer / consignee", value: det("buyer_name"), source: src("buyer_name") },
    { label: "Buyer address", value: det("buyer_address"), source: det("buyer_address") ? src("buyer_address") : `Booking has only ${s.destination_city ?? "?"}, ${s.destination_country ?? "?"}` },
    { label: "Invoice number", value: det("invoice_number"), source: src("invoice_number") },
    { label: "Invoice date", value: det("invoice_date"), source: src("invoice_date") },
    { label: "Incoterms", value: det("incoterms"), source: src("incoterms") },
    { label: "Reason for export", value: det("reason_for_export"), source: src("reason_for_export") },
    { label: "Currency", value: s.currency ?? "GBP", source: B },
    { label: "Invoice total", value: s.declared_value ? money(s.declared_value) : null, source: B },
    { label: "Packages", value: s.cartons && s.pallets ? `${s.cartons} cartons on ${s.pallets} pallets` : null, source: B },
    { label: "Gross weight", value: s.gross_weight_kg ? `${num(s.gross_weight_kg)} kg` : null, source: B },
    { label: "Net weight", value: netKg ? `${num(netKg)} kg` : null, source: "Calculated: unit weight × quantity" },
  ];
  const packing: OvRow[] = [
    { label: "Shipper", value: seller, source: det("exporter_address") ? "Booking + document details" : "Address needed" },
    { label: "Consignee", value: buyer, source: buyer ? "Document details" : "Needed" },
    { label: "Reference (invoice no.)", value: det("invoice_number"), source: src("invoice_number") },
    { label: "Pallets", value: s.pallets ? String(s.pallets) : null, source: B },
    { label: "Cartons", value: s.cartons ? String(s.cartons) : null, source: B },
    { label: "Gross weight", value: s.gross_weight_kg ? `${num(s.gross_weight_kg)} kg` : null, source: B },
    { label: "Net weight", value: netKg ? `${num(netKg)} kg` : null, source: "Calculated" },
  ];
  let carton = 1;
  return (
    <Card title="Booking overview" actions={actions}>
      {editor ?? (<>
      <dl className="mb-5 grid gap-x-6 gap-y-2 rounded-lg bg-slate-50 p-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Route", `${s.origin_city ?? "?"}, UK → ${s.destination_city ?? "?"}, ${s.destination_country ?? "?"}`],
          ["Delivering to", s.destination_type ? `${s.destination_type}${s.destination_type === "Warehouse" ? ` · slot booked: ${s.appointment_booked === null ? "?" : s.appointment_booked ? "Yes" : "No"}` : ""}` : null],
          ["Ready to ship", s.ready_date ? String(s.ready_date).slice(0, 10).split("-").reverse().join("-") : null],
          ["Priority", s.seller_priority ?? "Not given (Balanced used)"],
          ["Carrier", s.selected_carrier ?? "Not chosen yet"],
          ["Alert email", s.seller_email],
          ["Customs declaration", s.declaration_ref ? `${s.declaration_ref} (${String(s.declaration_date).slice(0, 10).split("-").reverse().join("-")})` : "Not yet"],
          ["Booking ID", s.id],
        ].map(([k, v]) => (
          <div key={k as string}><dt className="text-xs text-slate-500">{k}</dt><dd className="font-medium">{(v as string) || "–"}</dd></div>
        ))}
      </dl>
      {s.raw_input && <p className="mb-3 text-xs text-amber-800">Some values couldn&apos;t be read and are kept exactly as entered: {Object.entries(s.raw_input).map(([k, v]) => `${k.replaceAll("_", " ")} “${String(v)}”`).join(", ")}.</p>}
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Everything the commercial invoice and packing list need</p>
      <div className="grid gap-6 lg:grid-cols-2">
        <OvTable title="Commercial invoice" rows={invoice} />
        <OvTable title="Packing list" rows={packing} />
      </div>
      <div className="mt-5 overflow-x-auto">
        <h4 className="mb-1 text-sm font-semibold">Item lines</h4>
        <table className="w-full min-w-[760px] text-sm">
          <thead className="text-left text-xs text-slate-500">
            <tr>{["SKU", "Description", "HS code", "Origin", "Qty", "Unit price", "Line total", "Units/carton", "Cartons", "Carton nos.", "Carton size", "Carton kg", "Net kg"].map((h) => <th key={h} className="py-1 pr-2 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((it) => {
              const extra = d.items?.[it.sku] ?? {};
              const first = carton;
              carton += Number(it.cartons ?? 0);
              const cell = (v: string | null | undefined) => v ? v : <span className="text-red-700">Missing</span>;
              const dim = extra.carton_dimensions_cm && !validateDetail("carton_dimensions_cm", extra.carton_dimensions_cm.value) ? extra.carton_dimensions_cm.value : null;
              const kg = extra.carton_gross_weight_kg && !validateDetail("carton_gross_weight_kg", extra.carton_gross_weight_kg.value) ? extra.carton_gross_weight_kg.value : null;
              return (
                <tr key={it.id}>
                  <td className="py-1.5 pr-2 font-medium">{it.sku ?? "–"}</td>
                  <td className="pr-2">{it.description}</td>
                  <td className="pr-2 font-mono">{cell(it.hs_code && String(it.hs_code).length >= 6 ? it.hs_code : null)}</td>
                  <td className="pr-2">{cell(it.country_of_origin)}</td>
                  <td className="pr-2 tabular-nums">{num(it.quantity, 0)}</td>
                  <td className="pr-2 tabular-nums">{it.unit_price ? money(it.unit_price) : "–"}</td>
                  <td className="pr-2 tabular-nums">{it.unit_price && it.quantity ? money(Number(it.unit_price) * Number(it.quantity)) : "–"}</td>
                  <td className="pr-2 tabular-nums">{it.units_per_carton}</td>
                  <td className="pr-2 tabular-nums">{it.cartons}</td>
                  <td className="pr-2 tabular-nums">{it.cartons ? `${first}–${first + Number(it.cartons) - 1}` : "–"}</td>
                  <td className="pr-2">{cell(dim)}</td>
                  <td className="pr-2 tabular-nums">{cell(kg)}</td>
                  <td className="tabular-nums">{num(Number(it.unit_weight_kg ?? 0) * Number(it.quantity ?? 0))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-1 text-xs text-slate-500">Line totals, carton numbers and net weights are calculated from the booking.</p>
      </div>
      </>)}
    </Card>
  );
}

