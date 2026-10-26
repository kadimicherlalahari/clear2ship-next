import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AlertsView } from "@/components/AlertsView";
import { listAlerts, sellersWithContacts } from "@/lib/alerts";

export const dynamic = "force-dynamic";

export default async function AlertsPage() {
  const role = (await cookies()).get("c2s_role")?.value ?? "seller";
  if (role !== "seller" && role !== "admin") redirect("/");
  const [alerts, sellers] = await Promise.all([listAlerts(), sellersWithContacts()]);
  return (
    <AlertsView
      alerts={JSON.parse(JSON.stringify(alerts))}
      sellers={JSON.parse(JSON.stringify(sellers))}
      telegramConnected={!!process.env.TELEGRAM_BOT_TOKEN}
      emailConnected={!!process.env.RESEND_API_KEY}
    />
  );
}
