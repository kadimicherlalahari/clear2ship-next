"use client";
import { Check } from "lucide-react";
import { useState } from "react";
import {
  ALL_DESTINATION_CITIES, BOOKING_LABELS, DESTINATIONS, DESTINATION_COUNTRIES, DESTINATION_TYPES, ITEM_LABELS, ITEM_ORIGINS,
  ORIGIN_CITIES, PRIORITIES,
} from "@/lib/rules/constants";
import type { Issue } from "@/lib/rules/types";
import { toFormValues } from "./BookingForm";
import { Headline, type CheckLike } from "./CheckView";
import { DOC_LABEL } from "@/lib/rules/docs";
import { api, Button, Card, LevelBadge, postJson, ROLE_LABEL, formatTime } from "./ui";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Act = (fn: () => Promise<unknown>, done?: string) => Promise<void>;

type FixInput = {
  sku?: string; index?: number; field: string; label: string; current: string;
  options?: readonly string[]; placeholder?: string; whole?: boolean; number?: boolean;
};
type FixPlan = { inputs: FixInput[]; removeSku?: string; note?: string; anchor?: string };

const NUMBER_FIELDS = ["pallets", "cartons", "declared_value", "gross_weight_kg", "quantity", "units_per_carton", "unit_price", "unit_weight_kg"];
const WHOLE_FIELDS = ["pallets", "cartons", "quantity", "units_per_carton"];

function optionsFor(field: string, values: Record<string, string>): readonly string[] | undefined {
  switch (field) {
    case "origin_city": return ORIGIN_CITIES;
    case "destination_country": return DESTINATION_COUNTRIES;
    case "destination_city": return DESTINATIONS[values.destination_country] ?? ALL_DESTINATION_CITIES;
    case "destination_type": return DESTINATION_TYPES;
    case "seller_priority": return PRIORITIES;
    case "appointment_booked": return ["Yes", "No"];
    case "country_of_origin": return ITEM_ORIGINS;
  }
  return undefined;
}

/** Which input(s) fix a problem, worked out from its rule and key. */
function planFor(issue: Issue, shipment: Row, items: Row[]): FixPlan | null {
  const form = toFormValues(shipment, items);
  const parts = issue.key.split(":");
  const booking = (field: string): FixInput => ({
    field, label: BOOKING_LABELS[field as keyof typeof BOOKING_LABELS] ?? field, current: form[field] ?? "",
    options: optionsFor(field, form), number: NUMBER_FIELDS.includes(field), whole: WHOLE_FIELDS.includes(field),
    placeholder: field === "ready_date" ? "DD-MM-YYYY" : undefined,
  });
  const item = (ref: string, field: string): FixInput => {
    let index = items.findIndex((i) => String(i.sku ?? "") === ref);
    const bySku = index >= 0;
    if (!bySku && /^\d+$/.test(ref)) index = Number(ref);
    const it = form.items[index] ?? {};
    const name = bySku ? ref : `Item ${index + 1}`;
    return {
      ...(bySku ? { sku: ref } : { index }), field,
      label: `${name}: ${ITEM_LABELS[field as keyof typeof ITEM_LABELS] ?? field}`, current: it[field] ?? "",
      options: optionsFor(field, form), number: NUMBER_FIELDS.includes(field), whole: WHOLE_FIELDS.includes(field),
      placeholder: field === "hs_code" ? "6 or more digits" : undefined,
    };
  };

  switch (issue.code) {
    case "INPUT":
      if (parts[1] === "item") return { inputs: [item(parts[2], parts[3] === "hs_code_zero" ? "hs_code" : parts[3])] };
      if (parts[1] === "items") return { inputs: [], note: "Add an item with Edit booking below." };
      return { inputs: [booking(parts[1])] };
    case "R-01": return { inputs: [item(parts[1], "hs_code")] };
    case "R-02": return { inputs: [booking("declared_value")] };
    case "R-03": return { inputs: [item(parts[1], "quantity"), item(parts[1], "units_per_carton"), item(parts[1], "cartons")] };
    case "R-04": return { inputs: [booking("cartons")] };
    case "R-05": return { inputs: [booking("pallets")] };
    case "R-06": return { inputs: [item(parts[1], "description")], removeSku: parts[1] };
    case "R-07": return { inputs: [booking("gross_weight_kg")] };
    case "R-08": return { inputs: [booking("appointment_booked")] };
    case "R-09": return { inputs: [item(parts[1], "country_of_origin")] };
    case "R-10": return { inputs: [booking("ready_date")] };
    case "PRIORITY": return { inputs: [booking("seller_priority")] };
    case "D-01": return { inputs: [], note: "Upload or confirm it in Documents below.", anchor: "#documents" };
    case "D-02": return { inputs: [], note: "Correct the item quantities with Edit booking, or upload the right document.", anchor: "#documents" };
    case "D-03": return { inputs: [booking("declared_value")], note: "Or upload the right invoice in Documents." };
    case "D-04": return { inputs: [booking("cartons")], note: "Or upload the right packing list in Documents." };
    case "D-05": return { inputs: [booking("gross_weight_kg")], note: "Or upload the right packing list in Documents." };
    case "CARRIER": return { inputs: [], note: "Choose a carrier in Carrier recommendations below.", anchor: "#carrier" };
    case "APPOINTMENT": return { inputs: [], note: "Send a new delivery slot request below.", anchor: "#confirmations" };
    case "WAREHOUSE": return { inputs: [], note: "Correct the booking with Edit booking below, then the warehouse checks again." };
  }
  return null;
}

/** Same checks the server makes, so a wrong value is refused straight away. */
function localError(inp: FixInput, value: string): string | null {
  const v = value.trim();
  if (!v) return `${inp.label}: please enter a value.`;
  if (inp.field === "hs_code") {
    const digits = v.replace(/[\s.]/g, "");
    if (!/^\d+$/.test(digits)) return "HS code must contain digits only.";
    if (digits.length < 6) return `HS code needs at least 6 digits. You entered ${digits.length}. Please enter the full code (e.g. 0${digits}).`;
  }
  if (inp.number) {
    const n = Number(v.replace(/[£,\s]|kg$/gi, ""));
    if (!Number.isFinite(n) || n <= 0) return `${inp.label} must be a number above 0.`;
    if (inp.whole && !Number.isInteger(n)) return `${inp.label} must be a whole number.`;
  }
  if (inp.field === "ready_date" && !/^\d{1,2}[-/.]\d{1,2}[-/.]\d{4}$/.test(v)) return "Please enter the date as DD-MM-YYYY.";
  return null;
}

const inputCls = "w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500";

function FixRow({ shipmentId, issue, plan, act, busy }: { shipmentId: string; issue: Issue; plan: FixPlan; act: Act; busy: boolean }) {
  const [values, setValues] = useState<string[]>(plan.inputs.map((i) => i.current));
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const errors = plan.inputs.map((inp, i) => localError(inp, values[i]));
  const firstError = errors.find(Boolean) ?? null;

  const submit = async () => {
    setTried(true);
    if (firstError) { setError(firstError); return; }
    setError(null);
    await act(async () => {
      try {
        await postJson(`/api/shipments/${shipmentId}/actions`, {
          action: "fix", issueKey: issue.key,
          values: plan.inputs.map((inp, i) => ({ sku: inp.sku, index: inp.index, field: inp.field, value: values[i] })),
        });
      } catch (e) { setError((e as Error).message); throw e; }
    }, `Saved. ${issue.code === "INPUT" ? "Detail" : issue.code} fixed and all checks re-run.`);
  };

  return (
    <div className="mt-2 rounded-lg bg-slate-50 p-2.5">
      {plan.inputs.length > 0 && (
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          {plan.inputs.map((inp, i) => (
            <label key={inp.field + i} className="min-w-[9rem] flex-1 text-xs font-medium text-slate-600">
              {inp.label}
              {inp.options ? (
                <select className={inputCls} value={values[i]} onChange={(e) => setValues((v) => v.map((x, j) => (j === i ? e.target.value : x)))}>
                  <option value="">Choose…</option>
                  {inp.options.map((o) => <option key={o}>{o}</option>)}
                </select>
              ) : (
                <input className={`${inputCls} ${tried && errors[i] ? "border-red-400 ring-1 ring-red-300" : ""}`}
                  inputMode={inp.number || inp.field === "hs_code" ? "decimal" : undefined}
                  value={values[i]} placeholder={inp.placeholder} aria-invalid={tried && !!errors[i]}
                  onChange={(e) => { const val = e.target.value; setValues((v) => v.map((x, j) => (j === i ? val : x))); if (tried) setError(localError(inp, val)); }} />
              )}
            </label>
          ))}
          <Button type="submit" disabled={busy}>Submit fix</Button>
        </form>
      )}
      {plan.removeSku && (
        <Button variant="ghost" className="mt-1 text-red-700" disabled={busy} onClick={() => {
          if (confirm(`Remove item ${plan.removeSku} from this booking?`)) {
            act(() => postJson(`/api/shipments/${shipmentId}/actions`, { action: "fix", issueKey: issue.key, values: [{ sku: plan.removeSku, field: "__remove", value: true }] }), `Removed ${plan.removeSku}.`);
          }
        }}>Remove {plan.removeSku} from the booking</Button>
      )}
      {plan.note && (
        <p className="text-xs text-slate-600">{plan.anchor ? <a className="font-semibold text-slate-900 decoration-sky-500 decoration-2 underline-offset-4 hover:underline focus-visible:underline" href={plan.anchor}>{plan.note}</a> : plan.note}</p>
      )}
      {error && <p role="alert" className="mt-1.5 text-sm font-medium text-red-700">{error}</p>}
    </div>
  );
}

const unitText = (n: number, unit: string) =>
  unit === "GBP" ? `£${n.toLocaleString("en-GB", { maximumFractionDigits: 2 })}` : `${n.toLocaleString("en-GB", { maximumFractionDigits: 2 })} ${unit}`;

/**
 * Booking and document disagree: show both, and let the seller say which is right.
 *  1. The document is right → update the booking (checked, logged).
 *  2. The booking is right → upload a corrected document.
 *  3. The document was read wrong → enter what it really says (kept as "corrected by the seller").
 */
function MismatchFix({ shipmentId, issue, act, busy }: { shipmentId: string; issue: Issue; act: Act; busy: boolean }) {
  const c = issue.compare!;
  const [choice, setChoice] = useState<"doc" | "booking" | "misread" | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [actual, setActual] = useState("");
  const [error, setError] = useState<string | null>(null);
  const docName = DOC_LABEL[c.docKind];
  const run = (fn: () => Promise<unknown>, done: string) => act(async () => {
    setError(null);
    try { await fn(); } catch (e) { setError((e as Error).message); throw e; }
  }, done);
  const option = (id: typeof choice, title: string, help: string) => (
    <button type="button" onClick={() => { setChoice(id); setError(null); }} aria-pressed={choice === id}
      className={`flex-1 rounded-lg border p-2.5 text-left transition ${choice === id ? "border-sky-500 bg-sky-50 ring-1 ring-sky-500" : "border-slate-200 bg-white hover:border-slate-400"}`}>
      <span className="block text-sm font-semibold text-slate-900">{title}</span>
      <span className="block text-xs text-slate-500">{help}</span>
    </button>
  );

  return (
    <div className="mt-2 space-y-3 rounded-lg bg-slate-50 p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-2.5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Booking says</p>
          <p className="text-lg font-semibold tabular-nums">{unitText(c.bookingValue, c.unit)}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-2.5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{docName} says</p>
          <p className="text-lg font-semibold tabular-nums">{unitText(c.docValue, c.unit)}</p>
          <p className="text-xs italic text-slate-500">{c.correctedBySeller ? "Corrected by the seller" : c.docSource ? `Read from: “${c.docSource}”` : "Added up from the item lines"}</p>
        </div>
      </div>
      <p className="text-xs font-medium text-slate-600">Which one is right?</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        {option("doc", `The ${docName} is right`, c.bookingTarget ? `Change the booking to ${unitText(c.docValue, c.unit)}` : "Change the item quantities in the booking")}
        {option("booking", "The booking is right", `Upload a corrected ${docName}`)}
        {option("misread", `The ${docName} was read wrong`, "Enter what the document really says")}
      </div>

      {choice === "doc" && (c.bookingTarget ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm">Set the booking&apos;s {c.what.toLowerCase()} from {unitText(c.bookingValue, c.unit)} to <b>{unitText(c.docValue, c.unit)}</b>? Every check runs again.</p>
          <Button disabled={busy} onClick={() => run(() => postJson(`/api/shipments/${shipmentId}/actions`, {
            action: "fix", issueKey: issue.key,
            values: [{ sku: c.bookingTarget!.sku, field: c.bookingTarget!.field, value: c.docValue }],
          }), `Booking updated to match the ${docName}. All checks re-run.`)}>Update the booking</Button>
        </div>
      ) : <p className="text-sm">This booking has several items, so change their quantities with Edit booking (in Booking overview).</p>)}

      {choice === "booking" && (
        <div className="flex flex-wrap items-center gap-2">
          <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv" aria-label={`Corrected ${docName}`} onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-sm file:mr-2 file:rounded-md file:border-0 file:bg-slate-200 file:px-2.5 file:py-1 file:text-sm" />
          <Button disabled={busy || !file} onClick={() => run(async () => {
            const fd = new FormData();
            fd.append("kind", c.docKind);
            fd.append("file", file!);
            await api(`/api/shipments/${shipmentId}/documents`, { method: "POST", body: fd });
          }, `Corrected ${docName} uploaded and read. Confirm it in Documents to re-run the comparison.`)}>Upload corrected {docName}</Button>
        </div>
      )}

      {choice === "misread" && (
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => {
          e.preventDefault();
          run(() => postJson(`/api/shipments/${shipmentId}/actions`, { action: "correct-read", issueKey: issue.key, value: actual }),
            `Saved. The ${docName} value is marked "corrected by the seller", and all checks re-ran.`);
        }}>
          <label className="text-xs font-medium text-slate-600">
            What the {docName} really says ({c.unit})
            <input className={`${inputCls} w-40`} inputMode="decimal" value={actual} onChange={(e) => setActual(e.target.value)} placeholder={String(c.bookingValue)} />
          </label>
          <Button type="submit" disabled={busy || !actual.trim()}>Save correction</Button>
          <p className="w-full text-xs text-slate-500">The original reading stays on record, and the forwarder can see the value was corrected by you.</p>
        </form>
      )}
      {error && <p role="alert" className="text-sm font-medium text-red-700">{error}</p>}
    </div>
  );
}

function IssueItem({ issue, shipment, items, canFix, act, busy }: { issue: Issue; shipment: Row; items: Row[]; canFix: boolean; act: Act; busy: boolean }) {
  const ack = (shipment.acknowledged ?? {})[issue.key];
  const ticked = issue.severity === "AMBER" && ack?.message === issue.message;
  const plan = canFix ? planFor(issue, shipment, items) : null;
  // Document checks are warnings only: nothing to tick.
  const canTick = canFix && issue.severity === "AMBER" && !issue.code.startsWith("D-");
  return (
    <li className={`px-3 py-3 text-sm ${ticked ? "bg-green-50/60" : ""}`}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex w-28 shrink-0 items-center gap-1.5">
          <LevelBadge level={issue.kind} />
          <span className="font-mono text-xs text-slate-500">{issue.code === "INPUT" ? "" : issue.code}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-slate-900">{issue.message}</p>
          {issue.fix !== issue.message && <p className="text-slate-600">{issue.fix}</p>}
          {issue.owner !== "seller" && <p className="text-xs text-slate-500">For the {(ROLE_LABEL[issue.owner] ?? issue.owner).toLowerCase()}</p>}
          {ticked && <p className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-green-800"><Check className="h-3.5 w-3.5" aria-hidden /> Checked by {ack.by} · {formatTime(ack.at)}</p>}
        </div>
        {canTick && !ticked && (
          <Button variant="secondary" disabled={busy} onClick={() => act(
            () => postJson(`/api/shipments/${shipment.id}/actions`, { action: "acknowledge", issueKey: issue.key }), "Marked as checked.")}>
            <Check className="h-4 w-4" aria-hidden /> I&apos;ve checked this
          </Button>
        )}
      </div>
      {canFix && issue.compare && !ticked
        ? <MismatchFix shipmentId={shipment.id} issue={issue} act={act} busy={busy} />
        : plan && !ticked && <FixRow shipmentId={shipment.id} issue={issue} plan={plan} act={act} busy={busy} />}
    </li>
  );
}

export function ChecksPanel({ check, shipment, items, canFix, act, busy, showDisclaimer }: {
  check: CheckLike & { docIssues: Issue[]; allIssues: Issue[] }; shipment: Row; items: Row[]; canFix: boolean; act: Act; busy: boolean; showDisclaimer: boolean;
}) {
  const shown = new Set([...check.issues, ...check.docIssues].map((i) => i.key));
  const extra = check.allIssues.filter((i) => !shown.has(i.key));
  const list = (issues: Issue[]) => (
    <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
      {issues.map((i) => <IssueItem key={i.key} issue={i} shipment={shipment} items={items} canFix={canFix} act={act} busy={busy} />)}
    </ul>
  );
  return (
    <Card title="Checks">
      <span id="checks" />
      <div className="space-y-4">
        <div className="space-y-2">
          <Headline overall={check.overall} headline={check.headline} />
          {check.issues.length > 0 && list(check.issues)}
          {check.notes.map((n) => <p key={n} className="text-sm font-medium text-slate-700">Note: {n}</p>)}
        </div>
        {check.docIssues.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Documents <span className="font-normal text-slate-500">· warnings, they won&apos;t stop the booking</span></h3>
            {/* "Not uploaded / not confirmed yet" is one line here; the Documents section has the uploads. */}
            {(() => {
              const pending = check.docIssues.filter((i) => i.code === "D-01");
              const rest = check.docIssues.filter((i) => i.code !== "D-01");
              return (
                <>
                  {pending.length > 0 && (
                    <p className="flex flex-wrap items-center gap-2 text-sm">
                      <LevelBadge level="WARNING" />
                      <span>{pending.map((i) => i.message.replace(/\.$/, "")).join(". ")}.</span>
                      <a href="#documents" className="font-semibold text-slate-900 decoration-sky-500 decoration-2 underline-offset-4 hover:underline focus-visible:underline">Open Documents</a>
                    </p>
                  )}
                  {rest.length > 0 && list(rest)}
                </>
              );
            })()}
          </div>
        )}
        {extra.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Carrier, delivery slot and warehouse</h3>
            {list(extra)}
          </div>
        )}
        {!canFix && <p className="text-xs text-slate-500">Switch to the Seller role to fix problems here.</p>}
        <p className="text-xs text-slate-500">{showDisclaimer ? check.disclaimer : "These checks are not a customs clearance."}</p>
      </div>
    </Card>
  );
}

