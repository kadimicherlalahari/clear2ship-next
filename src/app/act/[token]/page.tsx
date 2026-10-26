import Link from "next/link";
import { ConfirmAction } from "@/components/ConfirmAction";
import { readActionToken } from "@/lib/actionLinks";
import { describeAction, loadAlertAction } from "@/lib/alerts";

export const dynamic = "force-dynamic";

/** Opened from an email / Telegram button. Shows what will happen; nothing changes until Confirm. */
export default async function ActPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = readActionToken(token);
  if (!t.ok) return <Box title="This link can't be used"><p className="text-sm text-slate-700">{t.reason}</p></Box>;
  let data;
  try {
    data = await loadAlertAction(t.value.alertId, t.value.index);
  } catch {
    return <Box title="This link can't be used"><p className="text-sm text-slate-700">The alert it belongs to no longer exists.</p></Box>;
  }
  const { alert, action, shipment } = data;
  return (
    <Box title={alert.title}>
      <ul className="mb-4 space-y-1 text-sm text-slate-700">{(alert.lines as string[]).map((l, i) => <li key={i}>{l}</li>)}</ul>
      {alert.resolved_at ? (
        <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">This has already been dealt with.</p>
      ) : (
        <ConfirmAction token={token} label={action.label} description={describeAction(action, shipment)} shipmentId={shipment.id} />
      )}
      <Link href={`/shipments/${shipment.id}`} className="mt-4 inline-block text-sm font-semibold text-slate-900 decoration-sky-500 decoration-2 underline-offset-4 hover:underline focus-visible:underline">Open {shipment.id} in Clear2Ship →</Link>
    </Box>
  );
}

function Box({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="mb-3 text-lg font-semibold">{title}</h1>
      {children}
    </div>
  );
}
