import { currentActor, handler, requireRole } from "@/lib/api";
import { submitBooking } from "@/lib/workflow";

export const POST = handler(async (req, { id }) => {
  const actor = await currentActor();
  requireRole(actor, "seller", "admin");
  await submitBooking(id, actor, await req.json().catch(() => ({})));
  return { ok: true };
});
