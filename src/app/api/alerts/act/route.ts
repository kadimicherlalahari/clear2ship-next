import { currentActor, handler, requireRole } from "@/lib/api";
import { performAlertAction } from "@/lib/alerts";

/** Run an action from an alert on the Alerts page. */
export const POST = handler(async (req) => {
  const actor = await currentActor();
  requireRole(actor, "seller", "admin");
  const { alertId, index } = (await req.json()) as { alertId: number; index: number };
  return performAlertAction(Number(alertId), Number(index), actor);
});
