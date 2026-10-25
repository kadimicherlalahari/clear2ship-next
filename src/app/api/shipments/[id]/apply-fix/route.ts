import { currentActor, handler, HttpError, requireRole } from "@/lib/api";
import { getShipment, toRawBooking, updateBooking } from "@/lib/shipments";

/** The seller chose a suggested fix (e.g. "Use 090111"). Never applied without this click. */
export const POST = handler(async (req, { id }) => {
  const actor = await currentActor();
  requireRole(actor, "seller", "admin");
  const { sku, field, value } = (await req.json()) as { sku?: string; field: string; value: string | number };
  const b = await getShipment(id);
  if (!b) throw new HttpError(404, "Shipment not found.");
  const raw = toRawBooking(b.shipment, b.items);
  if (sku) {
    const item = raw.items?.find((i) => String(i.sku) === sku);
    if (!item) throw new HttpError(400, `Item ${sku} not found.`);
    item[field] = value;
  } else {
    raw[field] = value;
  }
  return updateBooking(id, raw, actor, "Applied a suggested fix");
});
