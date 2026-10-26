"use client";
import Link from "next/link";
import { useState } from "react";
import { Button, ErrorNote, postJson } from "./ui";

export function ConfirmAction({ token, label, description, shipmentId }: { token: string; label: string; description: string; shipmentId: string }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (done) {
    return (
      <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
        Done. <Link href={`/shipments/${shipmentId}`} className="font-medium underline">See {shipmentId}</Link>
      </p>
    );
  }
  return (
    <div className="space-y-3 rounded-lg bg-slate-50 p-4">
      <p className="text-sm"><b>{label}</b></p>
      <p className="text-sm text-slate-600">{description}</p>
      <Button disabled={busy} onClick={async () => {
        setBusy(true); setErr(null);
        try { await postJson("/api/act", { token }); setDone(true); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
      }}>{busy ? "Working…" : "Confirm"}</Button>
      <ErrorNote text={err} />
    </div>
  );
}
