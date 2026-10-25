import { currentActor, handler, requireRole } from "@/lib/api";
import { createShipment, getShipment, listShipments, recheck } from "@/lib/shipments";
import type { RawBooking } from "@/lib/rules/types";

export const GET = handler(async (req) => {
  const status = new URL(req.url).searchParams.get("status") || undefined;
  return { shipments: await listShipments(status) };
});

/** New booking from the step-by-step form. */
export const POST = handler(async (req) => {
  const actor = await currentActor();
  requireRole(actor, "seller", "admin");
  const body = (await req.json()) as { booking: RawBooking; seller_email?: string };
  const id = await createShipment(actor, { ...body.booking, id: undefined }, body.seller_email?.trim() || null);
  await recheck(id, actor);
  return { id, bundle: await getShipment(id) };
});
