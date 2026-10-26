import { handler, HttpError } from "@/lib/api";
import { readActionToken } from "@/lib/actionLinks";
import { performAlertAction } from "@/lib/alerts";

/** Confirm an action from an email / Telegram link. The signed link stands in for the seller's login. */
export const POST = handler(async (req) => {
  const { token } = (await req.json()) as { token: string };
  const t = readActionToken(String(token ?? ""));
  if (!t.ok) throw new HttpError(400, t.reason);
  return performAlertAction(t.value.alertId, t.value.index, { role: "seller", name: "via alert link" });
});
