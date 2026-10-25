import { currentActor, handler, HttpError, requireRole } from "@/lib/api";
import { warehouseDecision } from "@/lib/workflow";

export const POST = handler(async (req, { id }) => {
  const actor = await currentActor();
  requireRole(actor, "warehouse", "admin");
  const { result, note } = (await req.json()) as { result: string; note?: string };
  if (result !== "accepted" && result !== "mismatch") throw new HttpError(400, "Choose accept or mismatch.");
  await warehouseDecision(id, result, note ?? "", actor);
  return { ok: true };
});
