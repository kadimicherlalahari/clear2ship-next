import { currentActor, handler, requireRole } from "@/lib/api";
import { markDelivered } from "@/lib/workflow";

export const POST = handler(async (_req, { id }) => {
  const actor = await currentActor();
  requireRole(actor, "forwarder", "admin");
  await markDelivered(id, actor);
  return { ok: true };
});
