"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useRole } from "./RoleSwitcher";
import { Button, Card, ErrorNote, postJson } from "./ui";

/** Admin-only: run the 24h/48h reminder check now, and reset the 3 sample shipments. */
export function AdminTools() {
  const role = useRole();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  if (role !== "admin") return null;

  const run = async (url: string, done: (d: Record<string, unknown>) => string) => {
    setBusy(true); setErr(null); setMsg(null);
    try {
      setMsg(done(await postJson<Record<string, unknown>>(url, {})));
      router.refresh();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <Card title="Admin tools">
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={busy} onClick={() => run("/api/reminders", (d) => {
          const sent = d.sent as string[];
          return sent.length ? `Sent: ${sent.join("; ")}` : "No reminders due right now.";
        })}>Run reminder check (24h / 48h)</Button>
        <Button variant="secondary" disabled={busy} onClick={() => {
          if (confirm("Reset the 3 sample shipments (BK-001, BK-002, BK-003) to their starting state?")) run("/api/admin/reset", () => "Sample shipments reset.");
        }}>Reset sample data</Button>
      </div>
      {msg && <p className="mt-2 text-sm text-slate-700">{msg}</p>}
      <ErrorNote text={err} />
    </Card>
  );
}
