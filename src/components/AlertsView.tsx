"use client";
import { ArrowRight, Bell, Check, Info, Mail, Send, TriangleAlert, X, type LucideIcon } from "lucide-react";
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
/** Still needs the seller: a warning / problem alert with something to do that hasn't been done yet. */
const isOpenTask = (a: Row) => !a.resolved_at && (a.actions ?? []).length > 0 && (a.severity === "warning" || a.severity === "error");

/** "BK-114: the carrier declined…" → "The carrier declined…" (the ID is shown as its own link). */
const headline = (a: Row) => {
  const t = String(a.title).replace(new RegExp(`^${a.shipment_id}:\\s*`), "");
  return t.charAt(0).toUpperCase() + t.slice(1);
};

type Part =
  | { kind: "todo"; text: string }
  | { kind: "quote"; label: string; text: string }
  | { kind: "fact"; label: string; value: string }
  | { kind: "text"; text: string };

/** Show each alert line by what it is: a reason (quote), a date or slot (fact), the next step, or plain text. Wording unchanged. */
function partOf(line: string): Part {
  const todo = line.match(/^What to do:\s*(.+)$/i);
  if (todo) return { kind: "todo", text: todo[1] };
  const quote = line.match(/^((?:Reason|Note)[^:]{0,40}):\s*[“"](.+?)[”"]\.?$/i);
  if (quote) return { kind: "quote", label: quote[1], text: quote[2] };
  const fact = line.match(/^([A-Z][A-Za-z ]{1,24}):\s+(.+)$/);
  if (fact) return { kind: "fact", label: fact[1], value: fact[2] };
  return { kind: "text", text: line };
}

const CHANNELS: { key: string; name: string; Icon: LucideIcon }[] = [
  { key: "email", name: "Email", Icon: Mail },
  { key: "telegram", name: "Telegram", Icon: Send },
];
const CHANNEL_STATE: Record<string, { text: string; cls: string }> = {
  sent: { text: "sent", cls: "bg-green-50 text-green-800" },
  outbox: { text: "in email log", cls: "bg-slate-100 text-slate-600" },
  not_connected: { text: "not connected", cls: "bg-slate-100 text-slate-500" },
  failed: { text: "failed", cls: "bg-red-50 text-red-800" },
};

/** Where the alert went: the app always, plus email and Telegram, as small icons (full wording on hover and for screen readers). */
function Channels({ c }: { c: Row | null }) {
  return (
    <span className="flex items-center gap-1" aria-label="Sent through">
      <span title="App: shown" className="inline-flex h-6 items-center gap-1 rounded-full bg-green-50 px-2 text-green-800">
        <Bell aria-hidden className="h-3.5 w-3.5" /><span className="sr-only">App: shown</span>
      </span>
      {CHANNELS.map(({ key, name, Icon }) => {
        const v = c?.[key] as { status: string; detail: string } | undefined;
        const st = CHANNEL_STATE[v?.status ?? "not_connected"];
        return (
          <span key={key} title={`${name}: ${st.text}${v?.detail ? ` (${v.detail})` : ""}`} className={`inline-flex h-6 items-center gap-1 rounded-full px-2 ${st.cls}`}>
            <Icon aria-hidden className="h-3.5 w-3.5" />
            {v?.status !== "sent" && <span className="text-[11px] font-medium">{st.text === "in email log" ? "log" : st.text === "not connected" ? "off" : st.text}</span>}
            <span className="sr-only">{name}: {st.text}</span>
          </span>
        );
      })}
    </span>
  );
}

function Meta({ a }: { a: Row }) {
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
      <Link href={`/shipments/${a.shipment_id}`} className="font-semibold text-slate-900 decoration-sky-500 decoration-2 underline-offset-4 hover:underline focus-visible:underline">{a.shipment_id}</Link>
      <span>{a.seller_name}</span>
      <span aria-hidden>·</span>
      <span>{TOPIC[a.topic] ?? a.topic}</span>
      <StatusBadge status={a.shipment_status} />
    </span>
  );
}

/** The alert's lines in their original order; facts next to each other share one row of chips. */
function Lines({ parts }: { parts: Part[] }) {
  const blocks: (Part | Extract<Part, { kind: "fact" }>[])[] = [];
  for (const p of parts) {
    const last = blocks.at(-1);
    if (p.kind === "fact" && Array.isArray(last)) last.push(p);
    else blocks.push(p.kind === "fact" ? [p] : p);
  }
  return (
    <div className="space-y-2 text-sm">
      {blocks.map((blk, i) => {
        if (Array.isArray(blk)) return (
          <dl key={i} className="flex flex-wrap gap-1.5">
            {blk.map((f) => (
              <div key={f.label} className="inline-flex items-baseline gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1">
                <dt className="text-xs text-slate-500">{f.label}</dt><dd className="font-semibold text-slate-900 tabular-nums">{f.value}</dd>
              </div>
            ))}
          </dl>
        );
        if (blk.kind === "quote") return (
          <figure key={i} className="rounded-xl bg-slate-50 px-3.5 py-2.5">
            <figcaption className="mb-0.5 text-xs text-slate-500">{blk.label}</figcaption>
            <blockquote className="font-medium text-slate-900">“{blk.text}”</blockquote>
          </figure>
        );
        if (blk.kind === "todo") return (
          <p key={i} className="flex gap-2 rounded-xl bg-sky-50 px-3.5 py-2.5 text-slate-900">
            <ArrowRight aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" />
            <span><span className="font-semibold">What to do:</span> {blk.text}</span>
          </p>
        );
        return <p key={i} className="text-slate-600">{blk.kind === "text" ? blk.text : ""}</p>;
      })}
    </div>
  );
}

function AlertCard({ a, onRead }: { a: Row; onRead: (id: number) => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const sev = SEVERITY[a.severity] ?? SEVERITY.info;
  const actions = (a.actions ?? []) as Action[];
  const task = isOpenTask(a);
  const parts = (a.lines as string[]).map(partOf);

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

  const title = (
    <p className="font-semibold leading-snug text-slate-900">
      {!a.read_at && <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-sky-600 align-middle" aria-label="unread" />}
      {headline(a)}
    </p>
  );
  const when = <time className="shrink-0 text-xs text-slate-500" title={formatTime(a.created_at)}>{timeAgo(a.created_at)}</time>;
  const icon = (size: string) => (
    <span className={`flex ${size} shrink-0 items-center justify-center rounded-full ${sev.dot}`} aria-hidden><sev.Icon className="h-4 w-4" strokeWidth={2.5} /></span>
  );

  // Updates (nothing to do): one compact row.
  if (!task) {
    return (
      <li className={`flex gap-3 px-4 py-3.5 first:rounded-t-2xl last:rounded-b-2xl sm:px-5 ${a.read_at ? "" : "bg-sky-50/60"}`} onMouseEnter={() => !a.read_at && onRead(a.id)}>
        {icon("mt-0.5 h-7 w-7")}
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
            <div className="min-w-0 space-y-1">{title}<Meta a={a} /></div>
            <div className="flex items-center gap-2">{when}</div>
          </div>
          <Lines parts={parts} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Channels c={a.channels} />
            {actions.length > 0 && a.resolved_at && <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700"><Check className="h-3.5 w-3.5" aria-hidden /> Done {timeAgo(a.resolved_at)}</span>}
            {actions.length > 0 && !a.resolved_at && (
              <div className="flex flex-wrap gap-2">
                {actions.map((x, i) => <Button key={i} variant="secondary" disabled={busy !== null} onClick={() => run(i, x)}>{busy === i ? "Working…" : x.label}</Button>)}
              </div>
            )}
          </div>
          {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm font-medium ${msg.ok ? "text-green-700" : "text-red-700"}`}>{msg.text}</p>}
        </div>
      </li>
    );
  }

  // Needs the seller: a full card with the reason, the next step and the actions.
  return (
    <li className={`rounded-2xl border bg-white p-4 shadow-sm sm:p-5 ${sev.ring} ${a.read_at ? "" : "ring-2 ring-sky-300"}`} onMouseEnter={() => !a.read_at && onRead(a.id)}>
      <div className="flex gap-3">
        {icon("h-9 w-9")}
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
            <div className="min-w-0 space-y-1">{title}<Meta a={a} /></div>
            {when}
          </div>
          <Lines parts={parts} />
          <div className="flex flex-wrap gap-2">
            {actions.map((x, i) => (
              <Button key={i} variant={x.action === "open" ? "secondary" : i === 0 ? "primary" : "secondary"} disabled={busy !== null} onClick={() => run(i, x)}>
                {busy === i ? "Working…" : x.label}
              </Button>
            ))}
          </div>
          {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm font-medium ${msg.ok ? "text-green-700" : "text-red-700"}`}>{msg.text}</p>}
          <Channels c={a.channels} />
        </div>
      </div>
    </li>
  );
}

/** "Today", "Yesterday", or e.g. "Fri 23 Oct". */
function dayOf(iso: string) {
  const d = new Date(iso);
  const key = (x: Date) => x.toLocaleDateString("en-GB", { timeZone: "Europe/London" });
  const now = new Date();
  if (key(d) === key(now)) return "Today";
  if (key(d) === key(new Date(now.getTime() - 864e5))) return "Yesterday";
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/London" });
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
          <p className="text-sm text-slate-600">Carrier, delivery slot, warehouse and customs updates, also sent by email and Telegram. Act on them here.</p>
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
          {shown.length ? (() => {
            const tasks = shown.filter(needsAction);
            const updates = shown.filter((a) => !needsAction(a));
            const days = new Map<string, Row[]>();
            for (const a of updates) {
              const d = dayOf(a.created_at);
              if (!days.has(d)) days.set(d, []);
              days.get(d)!.push(a);
            }
            return (
              <div className="space-y-6">
                {tasks.length > 0 && (
                  <section className="space-y-2">
                    <h2 className="text-sm font-semibold text-slate-900">Needs your action <span className="font-normal text-slate-500">· {tasks.length}</span></h2>
                    <ul className="space-y-3">{tasks.map((a) => <AlertCard key={a.id} a={a} onRead={markRead} />)}</ul>
                  </section>
                )}
                {[...days.entries()].map(([day, list]) => (
                  <section key={day} className="space-y-2">
                    <h2 className="text-sm font-semibold text-slate-900">{day}</h2>
                    <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200/80 bg-white shadow-sm">
                      {list.map((a) => <AlertCard key={a.id} a={a} onRead={markRead} />)}
                    </ul>
                  </section>
                ))}
              </div>
            );
          })()
            : <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">No alerts here.</p>}
        </div>
        <ContactSettings sellers={sellers} telegramConnected={telegramConnected} emailConnected={emailConnected} />
      </div>
    </div>
  );
}
