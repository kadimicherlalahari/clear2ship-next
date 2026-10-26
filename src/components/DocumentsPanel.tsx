"use client";
import { Pencil } from "lucide-react";
import { useState } from "react";
import { DETAIL_FIELDS, ITEM_DETAIL_FIELDS, missingDetails, validateDetail, type DetailValue, type DocDetails } from "@/lib/docDetails";
import { DOC_LABEL, REQUIRED_DOCS } from "@/lib/rules/docs";
import type { DocKind, ExtractedDoc } from "@/lib/rules/types";
import { api, Button, Card, ErrorNote, formatTime, postJson } from "./ui";

export type Doc = {
  id: number; kind: DocKind; filename: string; mime_type: string; size_bytes: number;
  extracted: ExtractedDoc | null; confirmed_at: string | null; uploaded_at: string;
};
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Act = (fn: () => Promise<unknown>, done?: string) => Promise<void>;

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

/** Upload one document; the seller confirms it. What it says is compared with the booking (D-checks). */
function DocBox({ shipmentId, kind, doc, canEdit, busy, act }: { shipmentId: string; kind: DocKind; doc?: Doc; canEdit: boolean; busy: boolean; act: Act }) {
  const [file, setFile] = useState<File | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const upload = () => act(async () => {
    const fd = new FormData();
    fd.append("kind", kind);
    fd.append("file", file!);
    const r = await api<{ readError: string | null }>(`/api/shipments/${shipmentId}/documents`, { method: "POST", body: fd });
    setReadError(r.readError);
    setFile(null);
  }, `${cap(DOC_LABEL[kind])} uploaded and read. Check the details below, then confirm it.`);
  const confirm = () => act(
    () => postJson(`/api/shipments/${shipmentId}/documents/${doc!.id}`, { extracted: doc!.extracted ?? {} }, "PUT"),
    `${cap(DOC_LABEL[kind])} confirmed. Document details filled in where they were blank, and all checks re-run.`);

  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">{cap(DOC_LABEL[kind])}</h3>
        {doc ? (
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${doc.confirmed_at ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-900"}`}>
            {doc.confirmed_at ? "Confirmed" : "Uploaded, please confirm"}
          </span>
        ) : <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">Not uploaded</span>}
      </div>
      {doc && (
        <p className="mb-2 text-xs text-slate-500">
          {doc.size_bytes > 0
            ? <a className="font-semibold text-slate-900 decoration-sky-500 decoration-2 underline-offset-4 hover:underline focus-visible:underline" href={`/api/shipments/${shipmentId}/documents/${doc.id}/file`} target="_blank" rel="noreferrer">{doc.filename}</a>
            : doc.filename}{" "}· uploaded {formatTime(doc.uploaded_at)}
        </p>
      )}
      {doc && Object.entries(doc.extracted ?? {}).filter(([, f]) => (f as { corrected_by_seller?: boolean })?.corrected_by_seller).map(([k, f]) => {
        const x = f as unknown as { value: string; original_value: unknown; original_source: string | null; corrected_by: string; corrected_at: string };
        return (
          <p key={k} className="mb-2 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-900">
            <Pencil className="mr-1 inline h-3 w-3" aria-hidden />{k.replaceAll("_", " ")}: read as <b>{String(x.original_value)}</b>{x.original_source && x.original_source !== String(x.original_value) ? ` (“${x.original_source}”)` : ""}, corrected to <b>{x.value}</b> by {x.corrected_by} · {formatTime(x.corrected_at)}
          </p>
        );
      })}
      {doc && !doc.confirmed_at && canEdit && (
        <div className="mb-2 space-y-2">
          <p className="text-xs text-slate-600">Quantities, value, cartons and weight are compared with the booking automatically. Details the booking doesn&apos;t have are copied into Document details when you confirm. Nothing is guessed.</p>
          <Button disabled={busy} onClick={confirm}>Confirm this {DOC_LABEL[kind]}</Button>
        </div>
      )}
      <ErrorNote text={readError} />
      {canEdit && (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
          <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv" aria-label={`Upload ${DOC_LABEL[kind]}`} onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-sm file:mr-2 file:rounded-md file:border-0 file:bg-slate-200 file:px-2.5 file:py-1 file:text-sm" />
          <Button variant="secondary" disabled={!file || busy} onClick={upload}>{busy ? "Reading…" : doc ? "Replace" : "Upload"}</Button>
        </div>
      )}
    </div>
  );
}

const inputCls = "w-full rounded-md border bg-white px-2 py-1.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500";

/** Only the fields the booking (template) doesn't fully cover. Each value is checked before saving. */
function DetailsForm({ shipment, items, canEdit, busy, act }: { shipment: Row; items: Row[]; canEdit: boolean; busy: boolean; act: Act }) {
  const details = (shipment.doc_details ?? {}) as DocDetails;
  const skus: string[] = items.map((i) => i.sku).filter(Boolean);
  const keyOf = (key: string, sku?: string) => (sku ? `${sku}|${key}` : key);
  const stored = (key: string, sku?: string): DetailValue | undefined => (sku ? details.items?.[sku]?.[key] : (details[key] as DetailValue | undefined));
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const val = (key: string, sku?: string) => values[keyOf(key, sku)] ?? stored(key, sku)?.value ?? "";
  const changed = Object.entries(values).filter(([k, v]) => {
    const [a, b] = k.includes("|") ? k.split("|") : [undefined, k];
    return v !== (stored(b, a)?.value ?? "");
  });
  const fieldError = (key: string, sku?: string) => {
    const v = val(key, sku);
    return v ? validateDetail(key, v) : null;
  };

  const save = () => {
    const bad = changed.map(([k, v]) => { const [a, b] = k.includes("|") ? k.split("|") : [undefined, k]; return validateDetail(b, v) ? `${a ? `${a}: ` : ""}${[...DETAIL_FIELDS, ...ITEM_DETAIL_FIELDS].find((f) => f.key === b)?.label}: ${validateDetail(b, v)}` : null; }).filter(Boolean);
    if (bad.length) { setError(bad.join(" ")); return; }
    setError(null);
    act(async () => {
      try {
        await postJson(`/api/shipments/${shipment.id}/actions`, {
          action: "doc-details",
          values: changed.map(([k, v]) => { const [a, b] = k.includes("|") ? k.split("|") : [undefined, k]; return { key: b, sku: a, value: v }; }),
        });
        setValues({});
      } catch (e) { setError((e as Error).message); throw e; }
    }, "Document details saved.");
  };

  const field = (f: (typeof DETAIL_FIELDS)[number], sku?: string) => {
    const s = stored(f.key, sku);
    const err = fieldError(f.key, sku);
    const id = `dd-${sku ?? "s"}-${f.key}`;
    return (
      <div key={id} className="text-sm">
        <label htmlFor={id} className="mb-1 flex flex-wrap items-center gap-1.5 font-medium text-slate-700">
          {f.label}
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${f.coverage === "partial" ? "bg-amber-100 text-amber-900" : "bg-red-100 text-red-800"}`}>
            {f.coverage === "partial" ? "Partly in booking" : "Not in booking"}
          </span>
        </label>
        {f.options ? (
          <select id={id} disabled={!canEdit} className={`${inputCls} border-slate-300`} value={val(f.key, sku)} onChange={(e) => setValues((p) => ({ ...p, [keyOf(f.key, sku)]: e.target.value }))}>
            <option value="">Choose…</option>{f.options.map((o) => <option key={o}>{o}</option>)}
          </select>
        ) : (
          <input id={id} disabled={!canEdit} className={`${inputCls} ${err ? "border-red-400" : "border-slate-300"}`} value={val(f.key, sku)}
            placeholder={f.hint} aria-invalid={!!err} onChange={(e) => setValues((p) => ({ ...p, [keyOf(f.key, sku)]: e.target.value }))} />
        )}
        {err ? <p className="mt-0.5 text-xs text-red-700">{err}</p>
          : s ? <p className="mt-0.5 text-xs italic text-slate-500">{s.source}</p>
          : <p className="mt-0.5 text-xs text-slate-500">{f.hint ?? `Needed for the ${f.docs.toLowerCase()}`}</p>}
      </div>
    );
  };

  const missing = missingDetails(details, skus);
  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Document details not in the booking</h3>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${missing.length ? "bg-amber-100 text-amber-900" : "bg-green-100 text-green-800"}`}>
          {missing.length ? `${missing.length} still needed` : "All provided"}
        </span>
      </div>
      <p className="mb-3 text-xs text-slate-600">The booking already covers quantities, values, HS codes, origin, cartons and weights. These are the details it only partly has, or doesn&apos;t have. They&apos;re filled in from your confirmed documents, or you can type them.</p>
      <div className="grid gap-4 sm:grid-cols-2">{DETAIL_FIELDS.map((f) => field(f))}</div>
      {skus.length > 0 && (
        <div className="mt-4 space-y-3">
          <h4 className="text-sm font-semibold">Per item (packing list)</h4>
          {skus.map((sku) => (
            <div key={sku} className="grid gap-4 rounded-md bg-slate-50 p-3 sm:grid-cols-[6rem_1fr_1fr]">
              <p className="pt-6 text-sm font-semibold">{sku}</p>
              {ITEM_DETAIL_FIELDS.map((f) => field(f, sku))}
            </div>
          ))}
        </div>
      )}
      {canEdit && (
        <div className="mt-4 flex items-center gap-3">
          <Button disabled={busy || changed.length === 0} onClick={save}>Save document details</Button>
          {changed.length > 0 && <span className="text-xs text-slate-500">{changed.length} unsaved change{changed.length === 1 ? "" : "s"}</span>}
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-sm font-medium text-red-700">{error}</p>}
    </div>
  );
}

export function DocumentsPanel({ shipment, items, documents, canEdit, busy, act }: { shipment: Row; items: Row[]; documents: Doc[]; canEdit: boolean; busy: boolean; act: Act }) {
  const latest = (k: DocKind) => documents.filter((d) => d.kind === k).at(-1);
  const editable = canEdit && !shipment.submitted_at;
  return (
    <Card title="Documents">
      <span id="documents" />
      <p className="mb-3 text-sm text-slate-600">Upload your commercial invoice and packing list (PDF, image or text). Both are needed before you can submit. Everything the documents need is listed in the Booking overview above.</p>
      <div className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-2">
          {REQUIRED_DOCS.map((k) => <DocBox key={k} shipmentId={shipment.id} kind={k} doc={latest(k)} canEdit={editable} busy={busy} act={act} />)}
        </div>
        <DetailsForm shipment={shipment} items={items} canEdit={editable} busy={busy} act={act} />
      </div>
    </Card>
  );
}
