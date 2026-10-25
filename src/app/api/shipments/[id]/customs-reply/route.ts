import { currentActor, handler, requireRole } from "@/lib/api";
import { sendCustomsReply } from "@/lib/workflow";

/** The seller answers a customs request (text + optional file). Sent to the forwarder. */
export const POST = handler(async (req, { id }) => {
  const actor = await currentActor();
  requireRole(actor, "seller", "admin");
  const form = await req.formData();
  const file = form.get("file");
  await sendCustomsReply(id, String(form.get("message") ?? ""), file instanceof File && file.size > 0 ? file : null, actor);
  return { ok: true };
});
