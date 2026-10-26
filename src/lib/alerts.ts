// Seller alerts: list them, mark them read, and run the action offered in an alert
// (from the Alerts page, or from the signed link in an email / Telegram message).
import { HttpError } from "./api";
import { q, type Row } from "./db";
import type { AlertAction } from "./email";
import type { Actor } from "./shipments";
import { answerProposedSlot, rebookCarrier, requestNewSlot } from "./workflow";

export async function listAlerts(seller?: string) {
  const params: unknown[] = [];
  let where = "";
  if (seller) { params.push(seller); where = "WHERE a.seller_name = $1"; }
  return q(
    `SELECT a.*, s.status AS shipment_status, s.origin_city, s.destination_city
       FROM alerts a JOIN shipments s ON s.id = a.shipment_id ${where}
      ORDER BY a.created_at DESC, a.id DESC LIMIT 300`,
    params,
  );
}

export async function unreadCount() {
  const [r] = await q("SELECT count(*)::int AS n FROM alerts WHERE read_at IS NULL");
  return r?.n ?? 0;
}

export async function sellersWithContacts() {
  return q(
    `SELECT seller_name, max(seller_email) AS email, max(seller_telegram_chat_id) AS telegram, count(*)::int AS shipments
       FROM shipments WHERE seller_name IS NOT NULL GROUP BY seller_name ORDER BY seller_name`,
  );
}

/** Where a seller's alerts go: email and Telegram chat ID, for all their shipments. */
export async function saveSellerContacts(seller: string, email: string, telegram: string) {
  const e = email.trim();
  const t = telegram.trim();
  if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new HttpError(400, "That email address doesn't look right.");
  if (t && !/^-?\d{5,15}$/.test(t)) throw new HttpError(400, "A Telegram chat ID is a number, e.g. 123456789. Get yours by messaging @userinfobot on Telegram.");
  await q("UPDATE shipments SET seller_email = $2, seller_telegram_chat_id = $3 WHERE seller_name = $1", [seller, e || null, t || null]);
}

/** What an action will do, in plain words (shown on the confirm page). */
export function describeAction(a: AlertAction, s: Row) {
  switch (a.action) {
    case "rebook-carrier": return `Choose ${a.params.carrier} for ${s.id} and send them the collection request.`;
    case "answer-slot": return a.params.accept
      ? `Accept the delivery slot the warehouse proposed for ${s.id}.`
      : `Decline the proposed slot for ${s.id} and ask the warehouse for another time.`;
    case "request-slot": return `Send the warehouse a new delivery slot request for ${s.id}.`;
    case "open": return `Open ${s.id}.`;
  }
}

export async function loadAlertAction(alertId: number, index: number) {
  const [alert] = await q("SELECT * FROM alerts WHERE id = $1", [alertId]);
  if (!alert) throw new HttpError(404, "Alert not found.");
  const action = ((alert.actions ?? []) as AlertAction[])[index];
  if (!action) throw new HttpError(404, "That action isn't available.");
  const [shipment] = await q("SELECT * FROM shipments WHERE id = $1", [alert.shipment_id]);
  return { alert, action, shipment };
}

/** Run the action from an alert. Stale actions are refused with the reason (e.g. already done elsewhere). */
export async function performAlertAction(alertId: number, index: number, actor: Actor) {
  const { alert, action } = await loadAlertAction(alertId, index);
  if (alert.resolved_at) throw new HttpError(400, "This has already been dealt with.");
  const id = alert.shipment_id as string;
  switch (action.action) {
    case "rebook-carrier": await rebookCarrier(id, action.params.carrier, actor); break;
    case "answer-slot": await answerProposedSlot(id, action.params.accept, actor); break;
    case "request-slot": await requestNewSlot(id, actor); break;
    case "open": return { shipmentId: id, open: action.params.anchor ?? null };
  }
  await q("UPDATE alerts SET resolved_at = now(), read_at = coalesce(read_at, now()) WHERE id = $1", [alertId]);
  return { shipmentId: id, open: null };
}
