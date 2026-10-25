import { currentActor, handler, requireRole } from "@/lib/api";
import { recordDeclaration } from "@/lib/workflow";

/** The forwarder records that THEY submitted the declaration. The app never submits to customs. */
export const POST = handler(async (req, { id }) => {
  const actor = await currentActor();
  requireRole(actor, "forwarder");
  const { ref, date } = (await req.json()) as { ref: string; date: string };
  await recordDeclaration(id, ref ?? "", date ?? "", actor);
  return { ok: true };
});
