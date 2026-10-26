"use client";
import { X } from "lucide-react";
import { useState } from "react";
import {
  ALL_DESTINATION_CITIES, DESTINATIONS, DESTINATION_COUNTRIES, DESTINATION_TYPES, ITEM_ORIGINS, ORIGIN_CITIES, PRIORITIES,
} from "@/lib/rules/constants";
import { Button, ErrorNote } from "./ui";

type Values = Record<string, string>;
export type FormBooking = Values & { items: Values[] };

const ITEM_FIELDS: { key: string; label: string; width: string }[] = [
  { key: "sku", label: "SKU", width: "w-24" },
  { key: "description", label: "Description", width: "w-48" },
  { key: "hs_code", label: "HS code", width: "w-24" },
  { key: "quantity", label: "Quantity", width: "w-20" },
  { key: "units_per_carton", label: "Units / carton", width: "w-20" },
  { key: "cartons", label: "Cartons", width: "w-20" },
  { key: "unit_price", label: "Unit price £", width: "w-20" },
  { key: "unit_weight_kg", label: "Unit kg", width: "w-20" },
  { key: "country_of_origin", label: "Country of origin", width: "w-36" },
];

const emptyItem = (): Values => Object.fromEntries(ITEM_FIELDS.map((f) => [f.key, ""]));

function display(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  const s = String(v);
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}-${iso[2]}-${iso[1]}`;
  if (/^-?\d+\.\d+$/.test(s)) return String(Number(s));
  return s;
}

/** Form values from a stored shipment (uses the seller's original text for anything that didn't parse). */
export function toFormValues(shipment: Record<string, unknown> | null, items: Record<string, unknown>[] = []): FormBooking {
  const raw = (shipment?.raw_input ?? {}) as Record<string, unknown>;
  const keys = ["seller_name", "origin_city", "destination_city", "destination_country", "destination_type", "ready_date",
    "seller_priority", "pallets", "cartons", "declared_value", "gross_weight_kg", "appointment_booked", "preferred_carrier"];
  const out: FormBooking = { items: [] } as unknown as FormBooking;
  for (const k of keys) out[k] = display(k in raw ? raw[k] : shipment?.[k]);
  out.items = items.length
    ? items.map((it) => {
        const r = (it.raw_input ?? {}) as Record<string, unknown>;
        return Object.fromEntries(ITEM_FIELDS.map((f) => [f.key, display(f.key in r ? r[f.key] : it[f.key])]));
      })
    : [emptyItem()];
  return out;
}

const input = "w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500";

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-0.5 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

function Select({ value, onChange, options, placeholder = "Choose…" }: { value: string; onChange: (v: string) => void; options: readonly string[]; placeholder?: string }) {
  const known = options.includes(value) || value === "";
  return (
    <select className={input} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {!known && <option value={value}>{value} (not supported)</option>}
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

/** Step-by-step booking form. Used for new bookings, edits, and when the chat can't read a message. */
export function BookingForm({ initial, initialEmail = "", submitLabel, onSubmit, disabled }: {
  initial: FormBooking; initialEmail?: string; submitLabel: string; disabled?: boolean;
  onSubmit: (booking: FormBooking, email: string) => Promise<void>;
}) {
  const [v, setV] = useState<FormBooking>(initial);
  const [email, setEmail] = useState(initialEmail);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: string, val: string) => setV((p) => ({ ...p, [k]: val }) as FormBooking);
  const setItem = (i: number, k: string, val: string) =>
    setV((p) => ({ ...p, items: p.items.map((it, j) => (j === i ? { ...it, [k]: val } : it)) }) as FormBooking);
  const cities = v.destination_country && DESTINATIONS[v.destination_country] ? DESTINATIONS[v.destination_country] : ALL_DESTINATION_CITIES;

  return (
    <form
      className="space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true); setErr(null);
        try { await onSubmit(v, email); } catch (e2) { setErr((e2 as Error).message); } finally { setBusy(false); }
      }}
    >
      <fieldset disabled={disabled || busy} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Seller name"><input className={input} value={v.seller_name} onChange={(e) => set("seller_name", e.target.value)} /></Field>
          <Field label="Email for alerts" hint="Problem alerts and customs updates go here."><input type="email" className={input} value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Field label="Origin city (United Kingdom)"><Select value={v.origin_city} onChange={(x) => set("origin_city", x)} options={ORIGIN_CITIES} /></Field>
          <Field label="Destination country"><Select value={v.destination_country} onChange={(x) => set("destination_country", x)} options={DESTINATION_COUNTRIES} /></Field>
          <Field label="Destination city"><Select value={v.destination_city} onChange={(x) => set("destination_city", x)} options={cities} /></Field>
          <Field label="Destination type"><Select value={v.destination_type} onChange={(x) => set("destination_type", x)} options={DESTINATION_TYPES} /></Field>
          {v.destination_type === "Warehouse" && (
            <Field label="Delivery appointment booked"><Select value={v.appointment_booked} onChange={(x) => set("appointment_booked", x)} options={["Yes", "No"]} /></Field>
          )}
          <Field label="Ready to ship date" hint="DD-MM-YYYY"><input className={input} placeholder="DD-MM-YYYY" value={v.ready_date} onChange={(e) => set("ready_date", e.target.value)} /></Field>
          <Field label="Seller priority"><Select value={v.seller_priority} onChange={(x) => set("seller_priority", x)} options={PRIORITIES} /></Field>
          <Field label="Pallets"><input inputMode="numeric" className={input} value={v.pallets} onChange={(e) => set("pallets", e.target.value)} /></Field>
          <Field label="Cartons (total)"><input inputMode="numeric" className={input} value={v.cartons} onChange={(e) => set("cartons", e.target.value)} /></Field>
          <Field label="Total gross weight (kg)"><input inputMode="decimal" className={input} value={v.gross_weight_kg} onChange={(e) => set("gross_weight_kg", e.target.value)} /></Field>
          <Field label="Total declared value (GBP)"><input inputMode="decimal" className={input} value={v.declared_value} onChange={(e) => set("declared_value", e.target.value)} /></Field>
          <Field label="Preferred carrier (optional)"><Select value={v.preferred_carrier} onChange={(x) => set("preferred_carrier", x)} options={["Carrier A", "Carrier B", "Carrier C"]} placeholder="No preference" /></Field>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold">Items</h3>
          <div className="overflow-x-auto">
            <table className="text-sm">
              <thead><tr>{ITEM_FIELDS.map((f) => <th key={f.key} className="px-1 pb-1 text-left text-xs font-medium text-slate-600">{f.label}</th>)}<th /></tr></thead>
              <tbody>
                {v.items.map((it, i) => (
                  <tr key={i}>
                    {ITEM_FIELDS.map((f) => (
                      <td key={f.key} className={`px-1 py-0.5 ${f.width}`}>
                        {f.key === "country_of_origin"
                          ? <Select value={it[f.key]} onChange={(x) => setItem(i, f.key, x)} options={ITEM_ORIGINS} placeholder="–" />
                          : <input aria-label={`${f.label} (item ${i + 1})`} className={input} value={it[f.key]} onChange={(e) => setItem(i, f.key, e.target.value)} />}
                      </td>
                    ))}
                    <td className="px-1">
                      <Button type="button" variant="ghost" aria-label={`Remove item ${i + 1}`} onClick={() => setV((p) => ({ ...p, items: p.items.filter((_, j) => j !== i) }) as FormBooking)}><X className="h-4 w-4" aria-hidden /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button type="button" variant="secondary" className="mt-2" onClick={() => setV((p) => ({ ...p, items: [...p.items, emptyItem()] }) as FormBooking)}>+ Add item</Button>
        </div>

        <div className="flex items-center gap-3">
          <Button type="submit">{busy ? "Saving…" : submitLabel}</Button>
          <span className="text-xs text-slate-500">Saving runs every check again. Nothing is booked.</span>
        </div>
      </fieldset>
      <ErrorNote text={err} />
    </form>
  );
}
