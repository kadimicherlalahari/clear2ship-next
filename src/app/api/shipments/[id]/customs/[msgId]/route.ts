import { currentActor, handler, requireRole } from "@/lib/api";
import { confirmCustomsStatus } from "@/lib/workflow";

/** A person confirms or dismisses the suggested customs status. */
export const POST = handler(async (req, { id, msgId }) => {
  const actor = await currentActor();
  requireRole(actor, "forwarder", "admin");
  await confirmCustomsStatus(id, Number(msgId), await req.json(), actor);
  return { ok: true };
});
