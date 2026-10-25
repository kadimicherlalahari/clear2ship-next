import { handler } from "@/lib/api";
import { q } from "@/lib/db";

export const GET = handler(async () => ({
  emails: await q("SELECT id, shipment_id, kind, to_address, subject, body, provider_id, error, sent_at FROM emails ORDER BY sent_at DESC LIMIT 200"),
}));
