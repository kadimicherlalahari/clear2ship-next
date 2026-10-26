"use client";
import { ArrowLeft } from "lucide-react";
import { ClearedStamp, MomentToast, useMilestone } from "./Moments";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { CarrierResult, Issue } from "@/lib/rules/types";
import { BookingForm, toFormValues } from "./BookingForm";
import { BookingOverview } from "./BookingOverview";
import { CarrierPanel } from "./CarrierPanel";
import { Chat } from "./Chat";
import { ChecksPanel } from "./ChecksPanel";
import type { CheckLike } from "./CheckView";
import { CustomsExceptionPanel, CustomsPanel, type CustomsMsg } from "./CustomsPanel";
import { Pipeline } from "./Pipeline";
import { DocumentsPanel, type Doc } from "./DocumentsPanel";
import { useRole } from "./RoleSwitcher";
import { ConfirmationsPanel, SubmitPanel, type Readiness } from "./SubmitPanel";
import { Timeline } from "./Timeline";
import { api, Button, Card, ErrorNote, formatTime, InfoNote, postJson, ROLE_LABEL, StatusBadge, timeAgo } from "./ui";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Bundle = {
  shipment: Row; items: Row[]; documents: Doc[]; issues: Row[]; events: Row[]; customs: CustomsMsg[]; emails: Row[]; replies: Row[]; alerts: Row[];
  chat: { role: "seller" | "app"; content: string }[];
  check: CheckLike & { docIssues: Issue[]; allIssues: Issue[]; readyForCustoms: boolean; inputBlocked: boolean; carrier: CarrierResult | null };
  readiness: Readiness;
};

const money = (v: unknown) => (v === null || v === undefined ? "–" : `£${Number(v).toLocaleString("en-GB", { maximumFractionDigits: 2 })}`);
const num = (v: unknown) => (v === null || v === undefined ? "–" : Number(v).toLocaleString("en-GB", { maximumFractionDigits: 3 }));
const date = (v: unknown) => (v ? String(v).slice(0, 10).split("-").reverse().join("-") : "–");

function NeedsRole({ role, roles, children }: { role: string; roles: string[]; children: React.ReactNode }) {
  if (roles.includes(role)) return <>{children}</>;
  return <InfoNote>Switch role to {roles.map((r) => ROLE_LABEL[r]).join(" or ")} at the top of the page to do this.</InfoNote>;
}

export function ShipmentView({ id }: { id: string }) {
  const role = useRole();
  const [b, setB] = useState<Bundle | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState("");
  const [declRef, setDeclRef] = useState("");
  const [declDate, setDeclDate] = useState("");
  const [flash, setFlash] = useState<string | null>(null);
  const { moment, clear: clearMoment } = useMilestone(b?.shipment.status, !!b?.shipment.submitted_at);

  const load = useCallback(async () => {
    try { setB(await api<Bundle>(`/api/shipments/${id}`)); setLoadErr(null); } catch (e) { setLoadErr((e as Error).message); }
  }, [id]);
  useEffect(() => { load(); }, [load]);
  // Links like /shipments/BK-003#customs-reply: the panels only exist once the data is in, so jump to them then.
  const loaded = b !== null;
  useEffect(() => {
    if (loaded && location.hash) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView({ block: "start" });
  }, [loaded]);

  /** Run an action, then reload everything (status, checks, timeline). Errors are shown where the action is. */
  const act = async (fn: () => Promise<unknown>, done?: string) => {
    setBusy(true); setErr(null); setFlash(null);
    try { await fn(); await load(); if (done) setFlash(done); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  if (loadErr) return <ErrorNote text={loadErr} />;
  if (!b) return <p className="text-slate-500">Loading…</p>;
  const s = b.shipment;
  const exception = ["On hold", "Rejected"].includes(s.customs_status ?? "");
  const locked = !!s.declaration_ref && !exception; // during a customs exception the seller can correct things
  const isSeller = role === "seller" || role === "admin";
  const chosen = b.check.carrier?.pick ? [b.check.carrier.pick, ...b.check.carrier.alternatives].find((c) => c.name === s.selected_carrier) : undefined;
  const booked = s.carrier_status === "confirmed";

  return (
    <div className="space-y-5">
      {/* 1. Header and what happens next */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/" className="text-sm font-semibold text-slate-900 decoration-sky-500 decoration-2 underline-offset-4 hover:underline focus-visible:underline"><ArrowLeft className="mr-1 inline h-4 w-4" aria-hidden />{isSeller ? "All shipments" : "Back to dashboard"}</Link>
          <h1 className="mt-2 flex flex-wrap items-center gap-3 text-4xl sm:text-5xl">{s.id} <StatusBadge status={s.status} /></h1>
          <p className="text-sm text-slate-600">
            {s.seller_name ?? "No seller yet"} · {s.origin_city ?? "?"}, UK → {s.destination_city ?? "?"}{s.destination_country ? `, ${s.destination_country}` : ""} · last update {timeAgo(s.updated_at)}
          </p>
          <Pipeline shipment={s} />
        </div>
        {s.pending_action && (
          <div className="w-full max-w-sm rounded-2xl bg-slate-900 p-4 text-sm text-white shadow-md sm:w-auto">
            <p className="text-base font-semibold leading-snug"><span className="text-sky-400">Next step:</span> {s.pending_action}</p>
            {s.responsible_role && <p className="mt-1 text-slate-300">Who: {ROLE_LABEL[s.responsible_role] ?? s.responsible_role}</p>}
          </div>
        )}
      </div>

      <div className="sticky top-20 z-30 space-y-2">
        {flash && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800 shadow-sm">{flash}</p>}
        {err && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 shadow-sm">{err}</p>}
      </div>

      {s.customs_status && (exception
        ? <CustomsExceptionPanel shipment={s} replies={b.replies} canReply={isSeller} act={act} busy={busy} />
        : (
          <Card className="border-green-300">
            <div className="flex items-center gap-5">
              <ClearedStamp />
              <div>
                <h2 className="text-lg font-bold tracking-tight">{s.status === "Delivered" ? "Cleared and delivered" : "Cleared by customs"}</h2>
                <p className="text-sm text-slate-600">Confirmed by a person. Clear2Ship never sets a customs status on its own.</p>
              </div>
            </div>
          </Card>
        ))}

      {moment && <MomentToast kind={moment} onDone={clearMoment} />}

      {/* 2. Checks, each with its fix right below it */}
      <ChecksPanel check={b.check} shipment={s} items={b.items} canFix={isSeller && !locked} act={act} busy={busy} showDisclaimer={!booked} />

      {/* 3. Carrier recommendations: ranked, selectable, regenerate by priority */}
      <CarrierPanel carrier={b.check.carrier} shipment={s} canChoose={isSeller && !locked} act={act} busy={busy} />

      {/* Chat for this booking: change details, or ask about it */}
      <Card title="Chat about this booking">
        {isSeller ? (
          <>
            <p className="mb-3 text-sm text-slate-600">Change a detail (e.g. &quot;make it 4 pallets&quot;) or ask a question (e.g. &quot;when is the collection?&quot;).</p>
            <Chat shipmentId={id} initialMessages={b.chat} onReply={load} />
          </>
        ) : <InfoNote>The chat is for the seller. Switch role to Seller to use it.</InfoNote>}
      </Card>

      {/* 4. Booking overview (key facts + everything the documents need) */}
      <BookingOverview shipment={s} items={b.items}
        actions={!locked && isSeller && !editing ? <Button variant="secondary" onClick={() => setEditing(true)}>Edit booking</Button> : null}
        editor={editing ? (
          <BookingForm initial={toFormValues(s, b.items)} initialEmail={s.seller_email ?? ""} submitLabel="Save and re-check"
            onSubmit={async (booking, email) => {
              const r = await postJson<{ changes: string[] }>(`/api/shipments/${id}`, { booking, seller_email: email }, "PUT");
              setEditing(false);
              await load();
              setFlash(r.changes.length ? `Saved. Changed: ${r.changes.join("; ")}. All checks re-run.` : "No changes.");
            }} />
        ) : undefined} />

      {/* 5. Documents: uploads, details the booking doesn't have, and the overview */}
      <DocumentsPanel shipment={s} items={b.items} documents={b.documents} canEdit={isSeller && !locked} busy={busy} act={act} />

      {/* 6. Submit booking (unlocks when every check is done and a carrier is chosen) */}
      <SubmitPanel shipment={s} readiness={b.readiness} canSubmit={isSeller} act={act} busy={busy}
        carrierPrice={chosen ? `${money(chosen.price)}, ${chosen.transitDays} days` : null} />

      {/* 7. After submit: carrier confirmation, then the warehouse delivery slot */}
      <ConfirmationsPanel shipment={s} role={role} act={act} busy={busy} canChooseCarrier={isSeller} />

      {s.submitted_at && !s.declaration_ref && (
        <Card title="Warehouse goods check">
          {s.warehouse_result && (
            <p className="mb-2 text-sm">Last decision: <b>{s.warehouse_result === "accepted" ? "Accepted" : "Mismatch"}</b>{s.warehouse_note ? ` – “${s.warehouse_note}”` : ""}</p>
          )}
          <NeedsRole role={role} roles={["warehouse", "admin"]}>
            <p className="mb-2 text-sm text-slate-600">Compare the goods with the booking ({num(s.pallets)} pallets, {num(s.cartons)} cartons, {num(s.gross_weight_kg)} kg).</p>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} aria-label="Warehouse note"
              placeholder="Note (required for a mismatch), e.g. “Only 88 cartons received”"
              className="mb-2 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
            <div className="flex gap-2">
              <Button disabled={busy} onClick={() => act(() => postJson(`/api/shipments/${id}/warehouse`, { result: "accepted", note }), "Goods accepted.").then(() => setNote(""))}>Accept goods</Button>
              <Button variant="danger" disabled={busy} onClick={() => act(() => postJson(`/api/shipments/${id}/warehouse`, { result: "mismatch", note }), "Mismatch flagged. The seller has been told.").then(() => setNote(""))}>Flag mismatch</Button>
            </div>
          </NeedsRole>
        </Card>
      )}

      {s.submitted_at && (
        <Card title="Customs declaration">
          {locked ? (
            <p className="text-sm">Declaration submitted by the forwarder: <b>{s.declaration_ref}</b> on {date(s.declaration_date)}.</p>
          ) : (
            <NeedsRole role={role} roles={["forwarder"]}>
              {s.status !== "Ready for customs" || !b.check.readyForCustoms ? (
                <InfoNote>Available once the shipment is Ready for customs (collection and delivery slot confirmed, goods accepted, no RED problems). Current status: {s.status}.</InfoNote>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-slate-600">Submit the declaration in your own customs system, then record it here. Clear2Ship does not submit anything to customs.</p>
                  <div className="flex flex-wrap gap-2">
                    <input value={declRef} onChange={(e) => setDeclRef(e.target.value)} placeholder="Reference number" aria-label="Declaration reference" className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
                    <input value={declDate} onChange={(e) => setDeclDate(e.target.value)} placeholder="Date DD-MM-YYYY" aria-label="Declaration date" className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
                    <Button disabled={busy} onClick={() => act(() => postJson(`/api/shipments/${id}/declaration`, { ref: declRef, date: declDate }), "Declaration recorded.")}>Declaration submitted</Button>
                  </div>
                </div>
              )}
            </NeedsRole>
          )}
        </Card>
      )}

      {s.declaration_ref && <CustomsPanel shipment={s} messages={b.customs} replies={b.replies} role={role} busy={busy} act={act} />}

      {s.status === "Cleared" && (
        <Card title="Delivery">
          <NeedsRole role={role} roles={["forwarder", "admin"]}>
            <Button disabled={busy} onClick={() => act(() => postJson(`/api/shipments/${id}/delivered`, {}), "Marked as delivered.")}>Mark as delivered</Button>
          </NeedsRole>
        </Card>
      )}

      {/* 9. Timeline */}
      <Timeline events={b.events as never} />

      {isSeller && (
        <Card title="Alerts sent to the seller" actions={<Link href="/alerts" className="text-sm font-semibold text-slate-900 decoration-sky-500 decoration-2 underline-offset-4 hover:underline focus-visible:underline">All alerts</Link>}>
          {!b.alerts.length && <p className="text-sm text-slate-500">No alerts yet.</p>}
          <ul className="space-y-2">
            {b.alerts.map((a) => (
              <li key={a.id} className="text-sm">
                <p><b>{a.title}</b> <span className="text-xs text-slate-500">· {formatTime(a.created_at)}</span></p>
                <p className="text-xs text-slate-500">
                  App: shown · Email: {a.channels?.email?.status === "sent" ? "sent" : a.channels?.email?.status === "outbox" ? "in email log" : "not sent"} · Telegram: {a.channels?.telegram?.status === "sent" ? "sent" : "not connected"}
                  {(a.actions ?? []).some((x: Row) => x.action !== "open") && (a.resolved_at ? " · done" : " · needs action")}
                </p>
              </li>
            ))}
          </ul>
          {role === "admin" && b.emails.length > 0 && (
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-slate-600">All emails for this shipment ({b.emails.length})</summary>
              <ul className="mt-2 space-y-2">
                {b.emails.map((m) => (
                  <li key={m.id}><b>{m.subject}</b> <span className="text-xs text-slate-500">→ {m.to_address} · {formatTime(m.sent_at)} · {m.provider_id ? "sent" : m.error}</span></li>
                ))}
              </ul>
            </details>
          )}
        </Card>
      )}
    </div>
  );
}
