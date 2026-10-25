import { currentActor, handler, requireRole } from "@/lib/api";
import { runReminders } from "@/lib/email";

/** Run the 24h / 48h reminder check now (Admin button; on Vercel a cron job calls /api/cron/reminders). */
export const POST = handler(async () => {
  requireRole(await currentActor(), "admin");
  return { sent: await runReminders() };
});
