import { currentActor, handler, HttpError, requireRole } from "@/lib/api";
import { saveSellerContacts } from "@/lib/alerts";

/** Where a seller's alerts go (email and Telegram chat ID), for all their shipments. */
export const POST = handler(async (req) => {
  requireRole(await currentActor(), "seller", "admin");
  const { seller, email, telegram } = (await req.json()) as { seller: string; email?: string; telegram?: string };
  if (!seller) throw new HttpError(400, "Choose a seller.");
  await saveSellerContacts(seller, email ?? "", telegram ?? "");
  return { ok: true };
});
