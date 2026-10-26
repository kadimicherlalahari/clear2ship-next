"use client";
import Link from "next/link";
import { useState } from "react";
import { CheckView, type CheckLike } from "./CheckView";
import { api, Button, Card, ErrorNote, LevelBadge } from "./ui";

type Result = { id: string; skipped?: string } & Partial<CheckLike>;
type Resp = { results: Result[]; warnings: string[]; errors: string[] };

/** Excel upload of the Bookings and Items sheets (a sub-tab of New booking). */
export function ExcelUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [resp, setResp] = useState<Resp | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  async function upload() {
    if (!file) return;
    setBusy(true); setErr(null); setResp(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      setResp(await api<Resp>("/api/upload-excel", { method: "POST", body: fd }));
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  const counts = { RED: 0, AMBER: 0, GREEN: 0 };
  for (const r of resp?.results ?? []) if (!r.skipped && r.overall) counts[r.overall]++;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-slate-600">
          Upload the Clear2Ship template with the <b>Bookings</b> and <b>Items</b> sheets. Each booking is checked and saved as a draft.{" "}
          <a href="/bookings_template.xlsx" className="font-semibold text-slate-900 decoration-sky-500 decoration-2 underline-offset-4 hover:underline focus-visible:underline">Download the template</a>
        </p>
      </div>
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <input type="file" accept=".xlsx" aria-label="Excel file" onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white" />
          <Button disabled={!file || busy} onClick={upload}>{busy ? "Checking…" : "Upload and check"}</Button>
        </div>
        <ErrorNote text={err} />
      </Card>

      {resp && (
        <Card title={`${resp.results.length} booking${resp.results.length === 1 ? "" : "s"}: ${counts.RED} red, ${counts.AMBER} amber, ${counts.GREEN} green`}>
          {resp.errors.map((e) => <ErrorNote key={e} text={e} />)}
          {resp.warnings.map((w) => (
            <p key={w} className="mb-2 flex items-start gap-2 text-sm"><LevelBadge level="WARNING" /> {w}</p>
          ))}
          <ul className="divide-y divide-slate-100">
            {resp.results.map((r) => (
              <li key={r.id} className="py-2">
                {r.skipped ? (
                  <p className="text-sm text-slate-600"><b>{r.id}</b>: {r.skipped}</p>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-3">
                      <LevelBadge level={r.overall ?? ""} />
                      <Link href={`/shipments/${r.id}`} className="font-semibold text-slate-900 decoration-sky-500 decoration-2 underline-offset-4 hover:underline focus-visible:underline">{r.id}</Link>
                      <span className="flex-1 text-sm text-slate-700">{r.headline}</span>
                      <Button variant="ghost" onClick={() => setOpen(open === r.id ? null : r.id)} aria-expanded={open === r.id}>
                        {open === r.id ? "Hide details" : "Details"}
                      </Button>
                    </div>
                    {open === r.id && <div className="mt-2"><CheckView check={r as CheckLike} /></div>}
                  </>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
