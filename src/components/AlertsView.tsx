"use client";
import { Check, Info, TriangleAlert, X, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Card, formatTime, postJson, StatusBadge, timeAgo } from "./ui";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Action = { label: string; action: string; params: { anchor?: string } };

const SEVERITY: Record<string, { Icon: LucideIcon; ring: string; dot: string }> = {
  success: { Icon: Check, ring: "border-green-200", dot: "bg-green-600 text-white" },
  info: { Icon: Info, ring: "border-slate-200", dot: "bg-slate-900 text-white" },
  warning: { Icon: TriangleAlert, ring: "border-amber-300", dot: "bg-amber-400 text-amber-950" },
  error: { Icon: X, ring: "border-red-300", dot: "bg-red-600 text-white" },
};
const TOPIC: Record<string, string> = { booking: "Booking", carrier: "Carrier", slot: "Delivery slot", goods: "Warehouse", customs: "Customs", problems: "Problems" };
const CHANNEL_STYLE: Record<string, string> = {
  sent: "bg-green-50 text-green-800",
  outbox: "bg-slate-100 text-slate-700",
  not_connected: "bg-slate-100 text-slate-700",
  failed: "bg-red-50 text-red-800",
};
const CHANNEL_TEXT: Record<string, string> = { sent: "sent", outbox: "in email log", not_connected: "not connected", failed: "failed" };

/** Still needs the seller: a warning / problem alert with something to do that hasn't been done yet. */
const isOpenTask = (a: Row) => !a.resolved_at && (a.actions ?? []).length > 0 && (a.severity === "warning" || a.severity === "error");

function Channels({ c }: { c: Row | null }) {
  const chip = (name: string, v?: { status: string; detail: string }) => (
    <span title={v?.detail} className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${CHANNEL_STYLE[v?.status ?? "not_connected"]}`}>
      {name}: {CHANNEL_TEXT[v?.status ?? "not_connected"]}
    </span>
  );
  return (
    <span className="flex flex-wrap gap-1">
      <span className="rounded bg-green-50 px-1.5 py-0.5 text-[11px] font-medium text-green-800">App: shown</span>
      {chip("Email", c?.email)}
      {chip("Telegram", c?.telegram)}
    </span>
  );
}

function AlertCard({ a, onRead }: { a: Row; onRead: (id: number) => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const sev = SEVERITY[a.severity] ?? SEVERITY.info;
  const actions = (a.actions ?? []) as Action[];
  const needsAction = isOpenTask(a);

  const run = async (i: number, x: Action) => {
    onRead(a.id);
    if (x.action === "open") { router.push(`/shipments/${a.shipment_id}${x.params.anchor ? `#${x.params.anchor}` : ""}`); return; }
    setBusy(i); setMsg(null);
    try {
      await postJson("/api/alerts/act", { alertId: a.id, index: i });
      setMsg({ ok: true, text: "Done." });
      router.refresh();
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); } finally { setBusy(null); }
  };

  return (
    <li className={`lift relative rounded-2xl border bg-white p-4 shadow-sm sm:p-5 ${sev.ring} ${a.read_at ? "" : "ring-2 ring-sky-300"}`} onMouseEnter={() => !a.read_at && onRead(a.id)}>
      <div className="flex gap-3">
        <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${sev.dot}`} aria-hidden><sev.Icon className="h-4 w-4" strokeWidth={2.5} /></span>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-semibold text-slate-900">
              {!a.read_at && <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-sky-600 align-middle" aria-label="unread" />}
              {a.title}
            </p>
            <time className="text-xs text-slate-500" title={formatTime(a.created_at)}>{timeAgo(a.created_at)}</time>
          </div>
          <p className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <Link href={`/shipments/${a.shipment_id}`} className="font-semibold text-slate-900 decoration-sky-500 decoration-2 underline-offset-4 hover:underline focus-visible:underline">{a.shipment_id}</Link>
            <span>{a.seller_name}</span>
            <span>· {TOPIC[a.topic] ?? a.topic}</span>
            <StatusBadge status={a.shipment_status} />
          </p>
          <ul className="space-y-0.5 text-sm text-slate-700">{(a.lines as string[]).map((l, i) => <li key={i}>{l}</li>)}</ul>
          {actions.length > 0 && (
            a.resolved_at ? (
              <p className="inline-flex items-center gap-1 text-xs font-medium text-green-700"><Check className="h-3.5 w-3.5" aria-hidden /> Done {timeAgo(a.resolved_at)}</p>
            ) : (
              <div className="flex flex-wrap gap-2 pt-1">
                {actions.map((x, i) => (
                  <Button key={i} variant={x.action === "open" ? "secondary" : i === 0 ? "primary" : "secondary"} disabled={busy !== null} onClick={() => run(i, x)}>
                    {busy === i ? "Working…" : x.label}
                  </Button>
                ))}
              </div>
            )
          )}
          {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm font-medium ${msg.ok ? "text-green-700" : "text-red-700"}`}>{msg.text}</p>}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <Channels c={a.channels} />
            {needsAction && <span className="text-xs font-semibold text-amber-800">Needs your action</span>}
          </div>
        </div>
      </div>
    </li>
  );
}

function ContactSettings({ sellers, telegramConnected, emailConnected }: { sellers: Row[]; telegramConnected: boolean; emailConnected: boolean }) {
  const router = useRouter();
  const [seller, setSeller] = useState(sellers[0]?.seller_name ?? "");
  const current = sellers.find((s) => s.seller_name === seller);
  const [email, setEmail] = useState(current?.email ?? "");
  const [telegram, setTelegram] = useState(current?.telegram ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { setEmail(current?.email ?? ""); setTelegram(current?.telegram ?? ""); setMsg(null); }, [seller]); // eslint-disable-line react-hooks/exhaustive-deps
  const input = "w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm";
  return (
    <Card title="Where alerts are sent">
      <div className="space-y-3 text-sm">
        <label className="block">Seller
          <select className={input} value={seller} onChange={(e) => setSeller(e.target.value)}>
            {sellers.map((s) => <option key={s.seller_name}>{s.seller_name}</option>)}
          </select>
        </label>
        <label className="block">Email
          <input className={input} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" />
        </label>
        <label className="block">Telegram chat ID
          <input className={input} value={telegram} onChange={(e) => setTelegram(e.target.value)} placeholder="e.g. 123456789" inputMode="numeric" />
          <span className="text-xs text-slate-500">On Telegram, message @userinfobot to get your ID, then start a chat with the Clear2Ship bot.</span>
        </label>
        <Button onClick={async () => {
          setMsg(null);
          try { await postJson("/api/alerts/contacts", { seller, email, telegram }); setMsg({ ok: true, text: `Saved for all of ${seller}'s shipments.` }); router.refresh(); }
          catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
        }}>Save</Button>
        {msg && <p className={`text-xs font-medium ${msg.ok ? "text-green-700" : "text-red-700"}`}>{msg.text}</p>}
        <div className="space-y-1 border-t border-slate-100 pt-3 text-xs text-slate-600">
          <p>Email: {emailConnected ? <span className="text-green-700">connected</span> : <span className="text-amber-700">not connected yet (emails go to the email log)</span>}</p>
          <p>Telegram bot: {telegramConnected ? <span className="text-green-700">connected</span> : <span className="text-amber-700">not connected yet (needs TELEGRAM_BOT_TOKEN)</span>}</p>
        </div>
      </div>
    </Card>
  );
}

export function AlertsView({ alerts, sellers, telegramConnected, emailConnected }: { alerts: Row[]; sellers: Row[]; telegramConnected: boolean; emailConnected: boolean }) {
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | "unread" | "action">("all");
  const [seller, setSeller] = useState("");
  const [read, setRead] = useState<Set<number>>(new Set());
  const markRead = (id: number) => {
    if (read.has(id)) return;
    setRead((r) => new Set(r).add(id));
    postJson("/api/alerts", { ids: [id] }).catch(() => {});
  };
  const withRead = alerts.map((a) => (read.has(a.id) && !a.read_at ? { ...a, read_at: new Date().toISOString() } : a));
  const needsAction = isOpenTask;
  const shown = withRead.filter((a) => (!seller || a.seller_name === seller)
    && (filter === "all" || (filter === "unread" ? !a.read_at : needsAction(a))));
  const unread = withRead.filter((a) => !a.read_at && (!seller || a.seller_name === seller)).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-4xl sm:text-5xl">Your <span className="text-sky-600">alerts.</span></h1>
          <p className="text-sm text-slate-600">Every update about your shipments: carrier, delivery slot, warehouse and customs. Each one is also emailed and sent on Telegram. Act on it right here.</p>
        </div>
        <Button variant="secondary" disabled={!unread} onClick={async () => { await postJson("/api/alerts", { all: true, seller: seller || undefined }); router.refresh(); }}>Mark all read</Button>
      </div>
      <div className="grid gap-5 lg:grid-cols-[1fr_18rem]">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {([["all", `All (${withRead.filter((a) => !seller || a.seller_name === seller).length})`], ["unread", `Unread (${unread})`], ["action", `Needs action (${withRead.filter((a) => needsAction(a) && (!seller || a.seller_name === seller)).length})`]] as const).map(([id, label]) => (
              <button key={id} onClick={() => setFilter(id)} aria-pressed={filter === id}
                className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${filter === id ? "bg-slate-900 text-white ring-slate-900" : "bg-white ring-slate-300 hover:bg-slate-100"}`}>{label}</button>
            ))}
            <select aria-label="Seller" className="ml-auto rounded-md border border-slate-300 bg-white px-2 py-1 text-xs" value={seller} onChange={(e) => setSeller(e.target.value)}>
              <option value="">All sellers</option>
              {sellers.map((s) => <option key={s.seller_name}>{s.seller_name}</option>)}
            </select>
          </div>
          {shown.length
            ? <ul className="space-y-3">{shown.map((a) => <AlertCard key={a.id} a={a} onRead={markRead} />)}</ul>
            : <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">No alerts here.</p>}
        </div>
        <ContactSettings sellers={sellers} telegramConnected={telegramConnected} emailConnected={emailConnected} />
      </div>
    </div>
  );
}
