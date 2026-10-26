"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BookingForm, toFormValues, type FormBooking } from "./BookingForm";
import { CheckView, type CheckLike } from "./CheckView";
import { api, Button, ErrorNote, postJson } from "./ui";

type Msg = { role: "seller" | "app"; content: string };
type Reply = { shipmentId: string; reply: string; fallback?: boolean; complete: boolean; result?: CheckLike };

export function Chat({ shipmentId: initialId = null, initialMessages = [], onReply, side = false }: { shipmentId?: string | null; initialMessages?: Msg[]; onReply?: () => void; side?: boolean }) {
  const [shipmentId, setShipmentId] = useState<string | null>(initialId);
  const [messages, setMessages] = useState<Msg[]>(initialMessages.length ? initialMessages : [{
    role: "app",
    content: "Hi! Tell me about your shipment in your own words: where it's going, when it's ready, how many pallets and cartons, and what's in it. I'll only ask for what's missing.",
  }]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<CheckLike | null>(null);
  const [fallback, setFallback] = useState<FormBooking | null>(null);
  const [fallbackEmail, setFallbackEmail] = useState("");
  const box = useRef<HTMLDivElement>(null);
  // Keep the newest message in view inside the chat box (without scrolling the page).
  useEffect(() => {
    if (box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [messages, busy]);

  async function send() {
    const message = text.trim();
    if (!message || busy) return;
    setText(""); setErr(null); setBusy(true);
    setMessages((m) => [...m, { role: "seller", content: message }]);
    try {
      const r = await postJson<Reply>("/api/chat", { shipmentId, message });
      setShipmentId(r.shipmentId);
      setMessages((m) => [...m, { role: "app", content: r.reply }]);
      if (r.result) setResult(r.result);
      onReply?.();
      if (r.fallback) {
        const b = await api<{ shipment: Record<string, unknown>; items: Record<string, unknown>[] }>(`/api/shipments/${r.shipmentId}`);
        setFallback(toFormValues(b.shipment, b.items));
        setFallbackEmail(String(b.shipment.seller_email ?? ""));
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div ref={box} className={`${side ? "max-h-[50vh] min-h-40" : "max-h-[60vh]"} space-y-3 overflow-y-auto rounded-xl border border-slate-200 bg-white p-4`}>
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "seller" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm ${m.role === "seller" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-900"}`}>
              {m.content}
            </div>
          </div>
        ))}
        {busy && <p className="text-sm text-slate-500">Reading your message…</p>}
      </div>

      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <label htmlFor="chat-input" className="sr-only">Message</label>
        <textarea
          id="chat-input"
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder='e.g. "3 pallets of mugs from Manchester to a warehouse in Frankfurt, ready 05-11-2026…"'
          className="flex-1 resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
        />
        <Button type="submit" disabled={busy || !text.trim()}>Send</Button>
      </form>
      <ErrorNote text={err} />

      {shipmentId && !onReply && (
        <p className="text-sm text-slate-600">
          Saved as draft <Link className="font-semibold text-slate-900 decoration-sky-500 decoration-2 underline-offset-4 hover:underline focus-visible:underline" href={`/shipments/${shipmentId}`}>{shipmentId}</Link>. Upload documents and submit from the shipment page.
        </p>
      )}

      {result && !onReply && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-2 text-sm font-semibold">Latest check</h3>
          <CheckView check={result} />
        </div>
      )}

      {fallback && shipmentId && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
          <h3 className="mb-1 text-sm font-semibold">Step-by-step form</h3>
          <p className="mb-3 text-sm text-slate-700">The chat couldn&apos;t read your message, so fill in the details here instead.</p>
          <BookingForm initial={fallback} initialEmail={fallbackEmail} submitLabel="Save and check" onSubmit={async (booking, email) => {
            await postJson(`/api/shipments/${shipmentId}`, { booking, seller_email: email }, "PUT");
            window.location.href = `/shipments/${shipmentId}`;
          }} />
        </div>
      )}
    </div>
  );
}
