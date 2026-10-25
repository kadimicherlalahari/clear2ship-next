import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { q } from "@/lib/db";

export const dynamic = "force-dynamic";

const KIND: Record<string, string> = {
  issues: "Problems / missing documents", reminder_24h: "24-hour reminder", admin_48h: "48-hour admin alert", exception: "Customs exception",
};

export default async function Outbox() {
  const role = (await cookies()).get("c2s_role")?.value ?? "seller";
  if (role !== "seller" && role !== "admin") redirect("/");
  const emails = await q("SELECT * FROM emails ORDER BY sent_at DESC LIMIT 200");
  const connected = !!process.env.RESEND_API_KEY;
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Outbox</h1>
        <p className="text-sm text-slate-600">
          Every email Clear2Ship has sent or tried to send.{" "}
          {connected ? "Email is connected through Resend." : "Email isn't connected yet, so emails are saved here instead of being sent."}
        </p>
      </div>
      {!emails.length && <p className="rounded-xl border border-slate-200 bg-white p-6 text-center text-slate-500">No emails yet.</p>}
      <ul className="space-y-3">
        {emails.map((m) => (
          <li key={m.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-semibold">{m.subject}</p>
              <p className="text-xs text-slate-500">
                {new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" }).format(new Date(m.sent_at))}
              </p>
            </div>
            <p className="text-xs text-slate-500">
              {KIND[m.kind] ?? m.kind} · to {m.to_address} · <Link href={`/shipments/${m.shipment_id}`} className="text-sky-700 hover:underline">{m.shipment_id}</Link>
              {" · "}<span className={m.provider_id ? "text-green-700" : "text-amber-700"}>{m.provider_id ? "Sent" : m.error}</span>
            </p>
            <details className="mt-2">
              <summary className="cursor-pointer text-sm text-slate-600">Show email</summary>
              <pre className="mt-2 whitespace-pre-wrap rounded-md bg-slate-50 p-3 font-sans text-sm text-slate-800">{m.body}</pre>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}
