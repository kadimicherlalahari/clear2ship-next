import { currentActor, handler, requireRole } from "@/lib/api";
import { listAlerts } from "@/lib/alerts";
import { q } from "@/lib/db";

export const GET = handler(async (req) => {
  requireRole(await currentActor(), "seller", "admin");
  return { alerts: await listAlerts(new URL(req.url).searchParams.get("seller") || undefined) };
});

/** Mark alerts as read: { ids: number[] } or { all: true, seller? }. */
export const POST = handler(async (req) => {
  requireRole(await currentActor(), "seller", "admin");
  const body = (await req.json()) as { ids?: number[]; all?: boolean; seller?: string };
  if (body.all) {
    await q("UPDATE alerts SET read_at = now() WHERE read_at IS NULL AND ($1::text IS NULL OR seller_name = $1)", [body.seller || null]);
  } else if (body.ids?.length) {
    await q("UPDATE alerts SET read_at = coalesce(read_at, now()) WHERE id = ANY($1)", [body.ids.map(Number)]);
  }
  return { ok: true };
});
