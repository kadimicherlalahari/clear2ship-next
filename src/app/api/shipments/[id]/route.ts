import { currentActor, handler, HttpError, requireRole } from "@/lib/api";
import { q } from "@/lib/db";
import { getShipment, logEvent, runAllChecks, submitReadiness, updateBooking } from "@/lib/shipments";
import type { RawBooking } from "@/lib/rules/types";

export const GET = handler(async (_req, { id }) => {
  const bundle = await getShipment(id);
  if (!bundle) throw new HttpError(404, `Shipment ${id} not found.`);
  const chat = await q("SELECT role, content, created_at FROM chat_messages WHERE shipment_id = $1 ORDER BY created_at, id", [id]);
  const check = runAllChecks(bundle);
  return { ...bundle, chat, check, readiness: submitReadiness(bundle, check) };
});

/** Seller edits the booking (form). Every change is listed on the timeline and all checks re-run. */
export const PUT = handler(async (req, { id }) => {
  const actor = await currentActor();
  requireRole(actor, "seller", "admin");
  const body = (await req.json()) as { booking?: RawBooking; seller_email?: string };
  if (body.seller_email !== undefined) {
    const [s] = await q("SELECT seller_email FROM shipments WHERE id = $1", [id]);
    const email = body.seller_email.trim() || null;
    if (s && (s.seller_email ?? null) !== email) {
      await q("UPDATE shipments SET seller_email = $2 WHERE id = $1", [id, email]);
      await logEvent(id, actor, `Alert email changed to ${email ?? "blank"}`);
    }
  }
  if (body.booking) {
    const { changes } = await updateBooking(id, { ...body.booking, id }, actor);
    return { changes };
  }
  return { changes: [] };
});
