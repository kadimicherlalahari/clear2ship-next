"use client";
import { useState } from "react";
import { api, Button, Card, formatTime, InfoNote, postJson, ROLE_LABEL } from "./ui";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
export type CustomsMsg = {
  id: number; raw_text: string; suggested_status: string | null; suggested_reason: string | null;
  suggested_next_steps: string | null; suggested_responsible: string | null;
  confirmed_status: string | null; confirmed_by: string | null; confirmed_at: string | null; dismissed_at: string | null;
  created_by: string; created_at: string;
};
type Act = (fn: () => Promise<unknown>, done?: string) => Promise<void>;

const input = "w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm";

/** Review a suggestion and confirm it. The status only changes on Confirm. */
function Pending({ shipmentId, m, busy, act }: { shipmentId: string; m: CustomsMsg; busy: boolean; act: Act }) {
  const [status, setStatus] = useState(m.suggested_status ?? "");
  const [reason, setReason] = useState(m.suggested_reason ?? "");
  const [next, setNext] = useState(m.suggested_next_steps ?? "");
  const [who, setWho] = useState(m.suggested_responsible ?? "");
  return (
    <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
      <p className="font-semibold">
        Suggested: {m.suggested_status ?? "no clear status found"}
        <span className="ml-2 font-normal text-slate-600">(not applied yet: please check and confirm)</span>
      </p>
      {!m.suggested_reason && m.suggested_status && m.suggested_status !== "Cleared" && (
        <p className="text-amber-900">The exact reason couldn&apos;t be found in the email. Please copy it from the email below.</p>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block">Status
          <select className={input} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Choose…</option>{["Cleared", "On hold", "Rejected"].map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
        <label className="block">Who has to act
          <select className={input} value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="">Choose…</option>{["seller", "warehouse", "forwarder", "admin"].map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
        </label>
      </div>
      <label className="block">Reason (copied exactly from the email)
        <textarea className={input} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      <label className="block">What customs is asking for (sent to the seller)
        <textarea className={input} rows={2} value={next} onChange={(e) => setNext(e.target.value)} />
      </label>
      <div className="flex gap-2">
        <Button disabled={busy || !status} onClick={() => act(
          () => postJson(`/api/shipments/${shipmentId}/customs/${m.id}`, { status, reason, next_steps: next, responsible: who }),
          `Customs status confirmed: ${status}.${status !== "Cleared" ? " The seller has been emailed." : ""}`)}>Confirm status</Button>
        <Button variant="secondary" disabled={busy} onClick={() => act(() => postJson(`/api/shipments/${shipmentId}/customs/${m.id}`, { dismiss: true }), "Suggestion dismissed. Nothing changed.")}>Dismiss</Button>
      </div>
    </div>
  );
}

function Replies({ replies, shipmentId }: { replies: Row[]; shipmentId: string }) {
  if (!replies.length) return null;
  return (
    <ul className="space-y-2">
      {replies.map((r) => (
        <li key={r.id} className="rounded-lg bg-sky-50 p-3 text-sm">
          <p className="text-xs text-slate-500">{ROLE_LABEL[r.created_by] ?? r.created_by} replied · {formatTime(r.created_at)}</p>
          <p className="whitespace-pre-wrap">{r.message}</p>
          {r.document_id && (
            <a className="text-xs text-sky-700 hover:underline" href={`/api/shipments/${shipmentId}/documents/${r.document_id}/file`} target="_blank" rel="noreferrer">📎 {r.filename}</a>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Seller view when customs put the shipment on hold or rejected it: what they asked for, and a reply box. */
export function CustomsExceptionPanel({ shipment: s, replies, canReply, act, busy }: { shipment: Row; replies: Row[]; canReply: boolean; act: Act; busy: boolean }) {
  const [message, setMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const rejected = s.customs_status === "Rejected";
  return (
    <Card title={rejected ? "Customs rejected this shipment" : "Customs needs something from you"} className={rejected ? "border-red-400" : "border-amber-400"}>
      <span id="customs-reply" />
      <div className="space-y-3 text-sm">
        <div className={`rounded-lg p-3 ${rejected ? "bg-red-50" : "bg-amber-50"}`}>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Reason, exactly as written by customs</p>
          <p className="italic">“{s.customs_reason}”</p>
          {s.customs_next_steps && <p className="mt-2"><b>What they&apos;re asking for:</b> {s.customs_next_steps}</p>}
          <p className="mt-1 text-xs text-slate-600">Who has to act: {ROLE_LABEL[s.customs_responsible] ?? "Seller"} · confirmed by a person, never set automatically.</p>
        </div>
        {s.customs_reply_at ? (
          <p className="font-medium text-green-800">✓ Reply sent to your forwarder {formatTime(s.customs_reply_at)}. They&apos;ll resubmit to customs.</p>
        ) : rejected ? (
          <p className="text-slate-700">You can now correct the booking, items and documents on this page. Then tell your forwarder what you changed below.</p>
        ) : null}
        <Replies replies={replies} shipmentId={s.id} />
        {canReply ? (
          <form className="space-y-2" onSubmit={(e) => {
            e.preventDefault();
            act(async () => {
              const fd = new FormData();
              fd.append("message", message);
              if (file) fd.append("file", file);
              await api(`/api/shipments/${s.id}/customs-reply`, { method: "POST", body: fd });
              setMessage(""); setFile(null);
            }, "Reply sent to your forwarder.");
          }}>
            <label className="block font-medium" htmlFor="customs-reply">{s.customs_reply_at ? "Send more information" : "Reply to customs (via your forwarder)"}</label>
            <textarea id="customs-reply" className={input} rows={3} value={message} onChange={(e) => setMessage(e.target.value)}
              placeholder={rejected ? "e.g. Corrected the HS code for VAS-02 to 701391 and uploaded a new invoice." : "e.g. Attached the supplier's declaration of origin for the glass vases."} />
            <div className="flex flex-wrap items-center gap-2">
              <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv" aria-label="Attach a document" onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="text-sm file:mr-2 file:rounded-md file:border-0 file:bg-slate-200 file:px-2.5 file:py-1 file:text-sm" />
              <Button type="submit" disabled={busy || message.trim().length < 5}>Send to forwarder</Button>
            </div>
          </form>
        ) : <InfoNote>The seller replies here. Switch role to Seller to reply.</InfoNote>}
      </div>
    </Card>
  );
}

/** Forwarder: pasted customs emails (suggest → a person confirms), and resubmitting after a hold / rejection. */
export function CustomsPanel({ shipment: s, messages, replies, role, busy, act }: { shipment: Row; messages: CustomsMsg[]; replies: Row[]; role: string; busy: boolean; act: Act }) {
  const [text, setText] = useState("");
  const [ref, setRef] = useState("");
  const [date, setDate] = useState("");
  const canAct = role === "forwarder" || role === "admin";
  const exception = ["On hold", "Rejected"].includes(s.customs_status ?? "");
  return (
    <Card title="Customs and forwarder emails">
      <span id="customs" />
      {exception && role === "forwarder" && (
        <div className="mb-4 space-y-2 rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm">
          <p className="font-semibold">Resubmit to customs</p>
          <p className="text-slate-700">{s.customs_reply_at ? "The seller has replied (see below). Send it on to customs in your own system, then record the new submission here." : "Waiting for the seller's reply. You can still resubmit if you've sorted it out directly."}</p>
          <Replies replies={replies} shipmentId={s.id} />
          <div className="flex flex-wrap gap-2">
            <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="New reference" aria-label="New declaration reference" className="rounded-md border border-slate-300 px-2 py-1.5" />
            <input value={date} onChange={(e) => setDate(e.target.value)} placeholder="Date DD-MM-YYYY" aria-label="Resubmission date" className="rounded-md border border-slate-300 px-2 py-1.5" />
            <Button disabled={busy} onClick={() => act(() => postJson(`/api/shipments/${s.id}/actions`, { action: "resubmit", ref, date }), "Resubmission recorded. The seller has been told.")}>Record resubmission</Button>
          </div>
        </div>
      )}
      {canAct ? (
        <div className="mb-4 space-y-2">
          <label htmlFor="customs-email" className="block text-sm text-slate-600">Paste an email from customs or the forwarder. We&apos;ll suggest a status; a person confirms it.</label>
          <textarea id="customs-email" rows={5} value={text} onChange={(e) => setText(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 font-mono text-xs" placeholder="Paste the whole email here…" />
          <Button disabled={busy || text.trim().length < 10} onClick={() => act(async () => {
            await postJson(`/api/shipments/${s.id}/customs`, { text });
            setText("");
          }, "Email read. Check the suggestion below and confirm.")}>{busy ? "Reading…" : "Read email"}</Button>
        </div>
      ) : <div className="mb-4"><InfoNote>Switch role to Freight forwarder or Admin to paste customs emails and confirm a status.</InfoNote></div>}

      <ul className="space-y-4">
        {messages.map((m) => (
          <li key={m.id} className="space-y-2">
            <p className="text-xs text-slate-500">Pasted by {ROLE_LABEL[m.created_by] ?? m.created_by} · {formatTime(m.created_at)}</p>
            <pre className="whitespace-pre-wrap rounded-md bg-slate-50 p-2 font-mono text-xs text-slate-700">{m.raw_text}</pre>
            {m.confirmed_at ? (
              <p className="text-sm">Confirmed <b>{m.confirmed_status}</b> by {m.confirmed_by} · {formatTime(m.confirmed_at)}</p>
            ) : m.dismissed_at ? (
              <p className="text-sm text-slate-500">Suggestion dismissed, no change.</p>
            ) : canAct ? (
              <Pending shipmentId={s.id} m={m} busy={busy} act={act} />
            ) : (
              <p className="text-sm text-amber-800">Waiting for the forwarder or admin to confirm. The status isn&apos;t shown until a person confirms it.</p>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
