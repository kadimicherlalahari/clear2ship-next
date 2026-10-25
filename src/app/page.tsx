import { cookies } from "next/headers";
import Link from "next/link";
import { AdminTools } from "@/components/AdminTools";
import { CarrierDashboard } from "@/components/dashboards/CarrierDashboard";
import { ForwarderDashboard } from "@/components/dashboards/ForwarderDashboard";
import { WarehouseDashboard } from "@/components/dashboards/WarehouseDashboard";
import { carrierDashboard, forwarderDashboard, warehouseDashboard } from "@/lib/dashboards";
import { StatusBadge } from "@/components/ui";
import { listShipments, STATUSES } from "@/lib/shipments";

export const dynamic = "force-dynamic";

const WHO: Record<string, string> = { seller: "Seller", warehouse: "Warehouse", forwarder: "Forwarder", carrier: "Carrier", admin: "Admin" };

function when(d: Date | string) {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" }).format(new Date(d));
}

/** Each role gets its own home: warehouse deliveries, forwarder customs, carrier collections; seller and admin see all shipments. */
export default async function Home({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const role = (await cookies()).get("c2s_role")?.value ?? "seller";
  if (role === "warehouse") return <WarehouseDashboard data={JSON.parse(JSON.stringify(await warehouseDashboard()))} />;
  if (role === "forwarder") return <ForwarderDashboard data={JSON.parse(JSON.stringify(await forwarderDashboard()))} />;
  if (role === "carrier") return <CarrierDashboard data={JSON.parse(JSON.stringify(await carrierDashboard()))} />;
  return <SellerDashboard searchParams={searchParams} />;
}

async function SellerDashboard({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const filter = STATUSES.includes(status as (typeof STATUSES)[number]) ? status : undefined;
  const [shipments, all] = await Promise.all([listShipments(filter), filter ? listShipments() : null]);
  const counts = new Map<string, number>();
  for (const s of all ?? shipments) counts.set(s.status, (counts.get(s.status) ?? 0) + 1);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Shipments</h1>
          <p className="text-sm text-slate-600">Everything in progress, what&apos;s waiting and who needs to act.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/new" className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700">New booking</Link>
          <Link href="/new?tab=excel" className="rounded-lg bg-white px-3 py-1.5 text-sm font-medium ring-1 ring-inset ring-slate-300 hover:bg-slate-50">Upload Excel</Link>
        </div>
      </div>

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
                  <Link href={`/shipments/${s.id}`} className="font-semibold text-sky-700 hover:underline">{s.id}</Link>
                  <div className="text-xs text-slate-500">
                    {s.seller_name ?? "No seller yet"} · {s.origin_city ?? "?"} → {s.destination_city ?? "?"}
                  </div>
                </td>
                <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                <td className="max-w-xs px-4 py-3 text-slate-700">{s.pending_action ?? "–"}</td>
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

      <AdminTools />
    </div>
  );
}
