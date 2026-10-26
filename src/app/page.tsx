import { cookies } from "next/headers";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Upload } from "lucide-react";
import { AdminTools } from "@/components/AdminTools";
import { SellerScene } from "@/components/illustrations/scenes";
import { RoleHero } from "@/components/RoleHero";
import { CarrierDashboard } from "@/components/dashboards/CarrierDashboard";
import { ForwarderDashboard } from "@/components/dashboards/ForwarderDashboard";
import { WarehouseDashboard } from "@/components/dashboards/WarehouseDashboard";
import { carrierDashboard, forwarderDashboard, sellerTasks, warehouseDashboard } from "@/lib/dashboards";
import { StatusBadge } from "@/components/ui";
import { listShipments, STATUSES } from "@/lib/shipments";

export const dynamic = "force-dynamic";

const WHO: Record<string, string> = { seller: "Seller", warehouse: "Warehouse", forwarder: "Forwarder", carrier: "Carrier", admin: "Admin" };

function when(d: Date | string) {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" }).format(new Date(d));
}

/** Each role gets its own home: warehouse deliveries, forwarder customs, carrier collections; seller and admin see all shipments. */
export default async function Home({ searchParams }: { searchParams: Promise<{ status?: string; view?: string }> }) {
  const role = (await cookies()).get("c2s_role")?.value ?? "seller";
  if (role === "warehouse") return <WarehouseDashboard data={JSON.parse(JSON.stringify(await warehouseDashboard()))} />;
  if (role === "forwarder") return <ForwarderDashboard data={JSON.parse(JSON.stringify(await forwarderDashboard()))} />;
  if (role === "carrier") return <CarrierDashboard data={JSON.parse(JSON.stringify(await carrierDashboard()))} />;
  return <SellerDashboard searchParams={searchParams} />;
}

async function SellerDashboard({ searchParams }: { searchParams: Promise<{ status?: string; view?: string }> }) {
  const { status, view } = await searchParams;
  const needsYou = view === "needs-you";
  const filter = STATUSES.includes(status as (typeof STATUSES)[number]) ? status : undefined;
  const [shipments, all] = await Promise.all([listShipments(filter), filter ? listShipments() : null]);
  const everything = all ?? shipments;
  const counts = new Map<string, number>();
  for (const s of everything) counts.set(s.status, (counts.get(s.status) ?? 0) + 1);

  return (
    <div className="space-y-5">
      <RoleHero
        lead="Ship it. Check it."
        accent="Clear it."
        sentence="Every booking checked before customs, with the next step and who owns it, from draft to delivered."
        note="checked, not guessed!"
        scene={<SellerScene className="h-auto w-full" />}
        actions={
          <>
            <Link href="/new" className="lift inline-flex items-center gap-1.5 rounded-full bg-sky-500 px-5 py-2.5 text-sm font-semibold text-slate-900 hover:bg-sky-400">
              New booking <ArrowRight aria-hidden className="h-4 w-4" />
            </Link>
            <Link href="/new?tab=excel" className="inline-flex items-center gap-1.5 rounded-full bg-white px-5 py-2.5 text-sm font-semibold ring-1 ring-inset ring-slate-300 hover:ring-slate-900">
              <Upload aria-hidden className="h-4 w-4" /> Upload Excel
            </Link>
          </>
        }
        stats={[
          { label: "In progress", value: everything.filter((s) => s.submitted_at && !["Delivered"].includes(s.status)).length },
          { label: "Need you now", value: everything.filter((s) => s.responsible_role === "seller" && s.status !== "Draft").length, tone: "orange", href: "/?view=needs-you#list" },
          { label: "Drafts", value: everything.filter((s) => s.status === "Draft").length, href: "/?status=Draft#list" },
          { label: "Delivered", value: everything.filter((s) => s.status === "Delivered").length, href: "/?status=Delivered#list" },
        ]}
      />

      <span id="list" className="block scroll-mt-28" />
      {needsYou ? <NeedsYou tasks={await sellerTasks()} /> : (<>
      <h2 className="pt-2 text-2xl font-extrabold tracking-tight [font-stretch:115%]">Your shipments</h2>

      <nav aria-label="Filter by status" className="flex flex-wrap gap-1.5">
        <Link href="/" className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${!filter ? "bg-slate-900 text-white ring-slate-900" : "bg-white ring-slate-300 hover:bg-slate-100"}`}>
          All ({(all ?? shipments).length})
        </Link>
        {STATUSES.map((s) => (
          <Link key={s} href={`/?status=${encodeURIComponent(s)}`}
            className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${filter === s ? "bg-slate-900 text-white ring-slate-900" : "bg-white ring-slate-300 hover:bg-slate-100"}`}>
            {s} ({counts.get(s) ?? 0})
          </Link>
        ))}
      </nav>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2.5">Shipment</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5">Pending action</th>
              <th className="px-4 py-2.5">Responsible</th>
              <th className="px-4 py-2.5">Problems</th>
              <th className="px-4 py-2.5">Last update</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {shipments.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">No shipments{filter ? ` with status "${filter}"` : ""} yet.</td></tr>
            )}
            {shipments.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link href={s.resume_chat ? `/new?draft=${s.id}` : `/shipments/${s.id}`} className="font-semibold text-slate-900 decoration-sky-500 decoration-2 underline-offset-4 hover:underline focus-visible:underline">{s.id}</Link>
                  <div className="text-xs text-slate-500">
                    {s.seller_name ?? "No seller yet"} · {s.origin_city ?? "?"} → {s.destination_city ?? "?"}
                  </div>
                </td>
                <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                <td className="max-w-xs px-4 py-3 text-slate-700">
                  {s.resume_chat ? (
                    <Link href={`/new?draft=${s.id}`} className="font-semibold text-slate-900 decoration-sky-500 decoration-2 underline-offset-4 hover:underline">
                      Continue in chat <ArrowRight aria-hidden className="inline h-3.5 w-3.5" />
                    </Link>
                  ) : s.pending_action ?? "–"}
                </td>
                <td className="px-4 py-3">{s.responsible_role ? WHO[s.responsible_role] ?? s.responsible_role : "–"}</td>
                <td className="px-4 py-3 text-xs">
                  {s.reds > 0 && <span className="mr-1 rounded bg-red-600 px-1.5 py-0.5 font-bold text-white">{s.reds} RED</span>}
                  {s.ambers > 0 && <span className="rounded bg-amber-400 px-1.5 py-0.5 font-bold text-amber-950">{s.ambers} AMBER</span>}
                  {!s.reds && !s.ambers && <span className="text-slate-400">None</span>}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">{when(s.updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      </>)}

      <AdminTools />
    </div>
  );
}

/** Where on the shipment page the seller fixes this kind of task. */
function fixAnchor(s: Record<string, any>) { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (["On hold", "Rejected"].includes(s.customs_status ?? "")) return { hash: "customs-reply", label: "Reply to customs" };
  if (s.carrier_status === "declined") return { hash: "carrier", label: "Choose a carrier" };
  if (["proposed", "declined"].includes(s.appointment_status ?? "")) return { hash: "confirmations", label: "Answer the slot" };
  return { hash: "checks", label: "Fix it" };
}

function waited(since: string | Date) {
  const h = (Date.now() - new Date(since).getTime()) / 36e5;
  const text = h < 1 ? "under an hour" : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} days`;
  // Same thresholds as the alerts: a reminder after 24 h, the admin after 48 h.
  const tone = h >= 48 ? "text-red-700" : h >= 24 ? "text-amber-700" : "text-slate-700";
  return { text, tone, late: h >= 24 };
}

/** The bookings behind "Need you now": what to do, why, how long it has waited, and a way straight to the fix. */
function NeedsYou({ tasks }: { tasks: Record<string, any>[] }) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const reds = tasks.reduce((t, s) => t + (s.reds ?? 0), 0);
  const late = tasks.filter((s) => waited(s.waiting_since).late).length;
  const alerts = tasks.reduce((t, s) => t + (s.open_alerts ?? 0), 0);
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3 pt-2">
        <div>
          <Link href="/#list" className="inline-flex items-center text-sm font-semibold text-slate-900 decoration-sky-500 decoration-2 underline-offset-4 hover:underline">
            <ArrowLeft aria-hidden className="mr-1 h-4 w-4" />All shipments
          </Link>
          <h2 className="mt-1 text-2xl font-extrabold tracking-tight [font-stretch:115%]">Needs you now <span className="text-sky-600">({tasks.length})</span></h2>
          <p className="text-sm text-slate-600">Bookings waiting on you, most urgent first. Each one says what to do and takes you straight to it.</p>
        </div>
        <dl className="flex flex-wrap gap-2 text-sm">
          {[
            { label: "RED problems", value: reds, tone: reds ? "text-red-700" : "text-slate-900" },
            { label: "Waiting over 24 h", value: late, tone: late ? "text-amber-700" : "text-slate-900" },
            { label: "Alerts to act on", value: alerts, tone: "text-slate-900" },
          ].map((m) => (
            <div key={m.label} className="rounded-full bg-white px-4 py-1.5 shadow-sm ring-1 ring-slate-200/80">
              <dt className="sr-only">{m.label}</dt>
              <dd><span className={`font-extrabold tabular-nums ${m.tone}`}>{m.value}</span> <span className="text-slate-600">{m.label}</span></dd>
            </div>
          ))}
        </dl>
      </div>

      {tasks.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">Nothing needs you right now. Nice one.</p>
      ) : (
        <div className="relative overflow-x-auto rounded-2xl border border-slate-200/80 bg-white shadow-sm">
          <table className="w-full min-w-[920px] text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2.5">Shipment</th>
                <th className="px-4 py-2.5">What you need to do</th>
                <th className="px-4 py-2.5">Problems</th>
                <th className="px-4 py-2.5">Stage</th>
                <th className="px-4 py-2.5">Waiting</th>
                <th className="px-4 py-2.5"><span className="sr-only">Action</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tasks.map((s) => {
                const w = waited(s.waiting_since);
                const fix = fixAnchor(s);
                return (
                  <tr key={s.id} className="align-top hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link href={`/shipments/${s.id}`} className="font-semibold text-slate-900 decoration-sky-500 decoration-2 underline-offset-4 hover:underline">{s.id}</Link>
                      <div className="text-xs text-slate-500">{s.seller_name} · {s.origin_city} → {s.destination_city}</div>
                    </td>
                    <td className="max-w-md px-4 py-3">
                      <p className="font-semibold text-slate-900">{s.pending_action}</p>
                      {s.customs_reason
                        ? <p className="mt-0.5 text-xs text-slate-600">Customs said: “{s.customs_reason}”</p>
                        : s.warehouse_note && s.status === "Mismatch"
                          ? <p className="mt-0.5 text-xs text-slate-600">Warehouse said: “{s.warehouse_note}”</p>
                          : s.top_issue && <p className="mt-0.5 text-xs text-slate-600">{s.top_issue}{s.top_fix && !String(s.pending_action).includes(s.top_fix) ? ` ${s.top_fix}` : ""}</p>}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <div className="flex flex-wrap gap-1">
                        {s.reds > 0 && <span className="rounded bg-red-600 px-1.5 py-0.5 font-bold text-white">{s.reds} RED</span>}
                        {s.ambers > 0 && <span className="rounded bg-amber-400 px-1.5 py-0.5 font-bold text-amber-950">{s.ambers} AMBER</span>}
                        {!s.reds && !s.ambers && <span className="text-slate-500">None</span>}
                      </div>
                      {s.open_alerts > 0 && <p className="mt-1 text-slate-600">{s.open_alerts} alert{s.open_alerts === 1 ? "" : "s"} to act on</p>}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                    <td className={`whitespace-nowrap px-4 py-3 font-semibold tabular-nums ${w.tone}`}>
                      {w.text}
                      <div className="text-xs font-normal text-slate-500">since {when(s.waiting_since)}</div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/shipments/${s.id}#${fix.hash}`} className="lift inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
                        {fix.label} <ArrowRight aria-hidden className="h-4 w-4" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
