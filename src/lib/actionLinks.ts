// Signed links for actions offered in an email or Telegram message (e.g. "Book Carrier B").
// The link only opens a confirm page; nothing happens until the seller presses Confirm.
import { createHmac, timingSafeEqual } from "node:crypto";

const DAYS = 14;

function secret() {
  const s = process.env.ACTION_LINK_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production") throw new Error("ACTION_LINK_SECRET is not set.");
  return "clear2ship-dev-only-secret"; // local development only
}

const b64 = (s: string) => Buffer.from(s).toString("base64url");
const sign = (body: string) => createHmac("sha256", secret()).update(body).digest("base64url");

export type ActionToken = { alertId: number; index: number; exp: number };

export function makeActionToken(alertId: number, index: number): string {
  const body = b64(JSON.stringify({ alertId, index, exp: Date.now() + DAYS * 864e5 } satisfies ActionToken));
  return `${body}.${sign(body)}`;
}

/** The token's contents if the signature is right and it hasn't expired; otherwise a reason. */
export function readActionToken(token: string): { ok: true; value: ActionToken } | { ok: false; reason: string } {
  const [body, sig] = token.split(".");
  if (!body || !sig) return { ok: false, reason: "This link isn't valid." };
  const expected = Buffer.from(sign(body));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { ok: false, reason: "This link isn't valid." };
  try {
    const value = JSON.parse(Buffer.from(body, "base64url").toString()) as ActionToken;
    if (value.exp < Date.now()) return { ok: false, reason: "This link has expired. Open the shipment in Clear2Ship instead." };
    return { ok: true, value };
  } catch {
    return { ok: false, reason: "This link isn't valid." };
  }
}
