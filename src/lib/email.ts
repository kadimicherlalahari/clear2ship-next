// Messages. Emails go through Resend when RESEND_API_KEY is set; otherwise they're saved to the
// email log (shown to admins). Everything for a seller is an *alert*: shown in the app, emailed, and
// sent on Telegram, with any actions the seller can take right from the alert.
import { Resend } from "resend";
import { makeActionToken } from "./actionLinks";
import { q, type Row } from "./db";
import { DOC_LABEL } from "./rules/docs";
import { sendTelegram, type ChannelResult } from "./telegram";

type Bundle = { shipment: Row; issues: Row[] };

const WHO: Record<string, string> = { seller: "You (the seller)", warehouse: "The warehouse", forwarder: "Your freight forwarder", carrier: "The carrier", admin: "The Clear2Ship admin" };
export const appUrl = () => process.env.APP_URL || "http://localhost:3100";

export type EmailKind =
  | "issues" | "reminder_24h" | "admin_48h" | "exception" | "submitted"
  | "carrier_request" | "carrier_confirmed" | "carrier_declined"
  | "appointment_request" | "appointment_confirmed" | "appointment_declined" | "appointment_proposed"
  | "customs_reply" | "resubmitted" | "goods_result" | "goods_rejected" | "customs_cleared" | "delivered";

export async function sendEmail(shipmentId: string, kind: EmailKind, to: string | null, subject: string, body: string): Promise<ChannelResult> {
  let providerId: string | null = null;
  let error: string | null = null;
  const toAddress = to || "(no email address)";
  if (!to) {
    error = "Not sent: no email address on this shipment.";
  } else if (!process.env.RESEND_API_KEY) {
    error = "Not sent: email isn't connected yet (RESEND_API_KEY is empty). Saved to the Outbox.";
  } else {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const res = await resend.emails.send({ from: process.env.EMAIL_FROM || "Clear2Ship <onboarding@resend.dev>", to, subject, text: body });
      if (res.error) error = `Resend error: ${res.error.message}`;
      else providerId = res.data?.id ?? null;
    } catch (e) {
      error = `Resend error: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  await q(
    "INSERT INTO emails (shipment_id, kind, to_address, subject, body, provider_id, error) VALUES ($1,$2,$3,$4,$5,$6,$7)",
    [shipmentId, kind, toAddress, subject, body, providerId, error],
  );
  await q(
    "INSERT INTO events (shipment_id, actor_role, action) VALUES ($1, 'system', $2)",
    [shipmentId, `Email "${subject}" ${providerId ? "sent" : "saved to the email log"} (to ${toAddress})`],
  );
  if (providerId) return { status: "sent", detail: `Emailed to ${toAddress}.` };
  if (!to) return { status: "not_connected", detail: "No email address on this shipment." };
  if (!process.env.RESEND_API_KEY) return { status: "outbox", detail: "Email isn't connected yet; saved to the email log." };
  return { status: "failed", detail: error ?? "Email failed." };
}

// ---------------------------------------------------------------- seller alerts (app + email + Telegram)

export type AlertAction =
  | { label: string; action: "rebook-carrier"; params: { carrier: string } }
  | { label: string; action: "answer-slot"; params: { accept: boolean } }
  | { label: string; action: "request-slot"; params: Record<string, never> }
  | { label: string; action: "open"; params: { anchor?: string } };

export type SellerAlert = {
  topic: "booking" | "carrier" | "slot" | "goods" | "customs" | "problems";
  kind: EmailKind;
  severity: "success" | "info" | "warning" | "error";
  title: string;
  lines: string[];
  actions?: AlertAction[];
};

/** Link for an action: plain links for "open", signed one-time-confirm links for everything else. */
export function actionUrl(shipmentId: string, alertId: number, index: number, a: AlertAction) {
  if (a.action === "open") return `${appUrl()}/shipments/${shipmentId}${a.params.anchor ? `#${a.params.anchor}` : ""}`;
  return `${appUrl()}/act/${makeActionToken(alertId, index)}`;
}

/** Tell the seller: save the alert (Alerts page), email it and send it on Telegram, with action buttons/links. */
export async function notifySeller(s: Row, a: SellerAlert) {
  const actions = a.actions ?? [];
  const [row] = await q(
    `INSERT INTO alerts (shipment_id, seller_name, topic, kind, severity, title, lines, actions)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [s.id, s.seller_name, a.topic, a.kind, a.severity, a.title, JSON.stringify(a.lines), actions.length ? JSON.stringify(actions) : null],
  );
  const links = actions.map((x, i) => ({ text: x.label, url: actionUrl(s.id, row.id, i, x) }));
  const shipmentLink = `${appUrl()}/shipments/${s.id}`;

  const body = `Hi ${s.seller_name ?? "there"},

${a.lines.join("\n")}
${links.length ? `\nWhat you can do now:\n${links.map((l) => `  • ${l.text}: ${l.url}`).join("\n")}\n` : ""}
Open the shipment: ${shipmentLink}

– Clear2Ship`;
  const email = await sendEmail(s.id, a.kind, s.seller_email, a.title, body);
  const telegram = await sendTelegram(
    s.seller_telegram_chat_id ?? null,
    `${a.title}\n\n${a.lines.join("\n")}`,
    [...links, { text: `Open ${s.id}`, url: shipmentLink }],
  );
  await q("UPDATE alerts SET channels = $2 WHERE id = $1", [row.id, JSON.stringify({ email, telegram })]);
  return row.id as number;
}

/** The seller has dealt with it (here or from the alert): older alerts on this topic no longer need action. */
export async function resolveAlerts(shipmentId: string, topic: SellerAlert["topic"]) {
  await q("UPDATE alerts SET resolved_at = now() WHERE shipment_id = $1 AND topic = $2 AND resolved_at IS NULL AND actions IS NOT NULL", [shipmentId, topic]);
}

function problemList(issues: Row[]) {
  const open = issues.filter((i) => i.status === "open");
  const reds = open.filter((i) => i.severity === "RED");
  const ambers = open.filter((i) => i.severity === "AMBER");
  const line = (i: Row) => `  • ${i.message}\n    What to do: ${i.fix}\n    Who: ${WHO[i.owner_role] ?? i.owner_role}`;
  let text = "";
  if (reds.length) text += `Must fix before it can go to customs (${reds.length}):\n${reds.map(line).join("\n")}\n\n`;
  if (ambers.length) text += `Worth checking (${ambers.length}):\n${ambers.map(line).join("\n")}\n\n`;
  return { text, reds, ambers };
}

/** Problems / missing documents email, its 24-hour reminder, or the 48-hour admin alert. */
export async function sendIssuesEmail(b: Bundle, kind: "issues" | "reminder_24h" | "admin_48h") {
  const s = b.shipment;
  const { text, reds, ambers } = problemList(b.issues);
  if (!reds.length && !ambers.length) return;
  const missingDocs = b.issues.filter((i) => i.status === "open" && i.code === "D-01" && i.severity === "RED")
    .map((i) => DOC_LABEL[String(i.field_key).split(":")[1] as keyof typeof DOC_LABEL]).filter(Boolean);
  const link = `${appUrl()}/shipments/${s.id}`;

  if (kind === "admin_48h") {
    const subject = `[Clear2Ship] ${s.id} has had open problems for 48 hours`;
    const body = `Hi,

Shipment ${s.id} (${s.seller_name ?? "unknown seller"}) still has ${reds.length + ambers.length} open problem(s) after 48 hours. The seller was emailed and reminded.

${text}Shipment: ${link}

– Clear2Ship`;
    return sendEmail(s.id, kind, process.env.ADMIN_EMAIL || null, subject, body);
  }

  const reminder = kind === "reminder_24h";
  const title = reminder
    ? `Reminder: ${s.id} still needs your attention`
    : missingDocs.length
      ? `${s.id}: please upload the ${missingDocs.join(" and ")}`
      : `${s.id}: ${reds.length ? "a few things to fix before customs" : "a few things to check"}`;
  const open = b.issues.filter((i) => i.status === "open");
  return notifySeller(s, {
    topic: "problems", kind, severity: reds.length ? "error" : "warning", title,
    lines: [
      `${reminder ? "Just a reminder: these are still open on" : "We checked"} your shipment ${s.id} (${s.origin_city ?? "?"} → ${s.destination_city ?? "?"})${reminder ? " after 24 hours." : " and found a few things that need your attention."}`,
      ...open.map((i) => `• ${i.severity}: ${i.message} What to do: ${i.fix}`),
      "Once you've made the changes, we'll run the checks again automatically.",
    ],
    actions: [{ label: "Fix them now", action: "open", params: { anchor: "checks" } }],
  });
}

/** Customs on hold / rejected: the reason exactly as written, the next steps and who is responsible. */
export async function sendExceptionEmail(s: Row, status: string, reason: string, nextSteps: string | null, responsible: string | null) {
  return notifySeller(s, {
    topic: "customs", kind: "exception", severity: status === "Rejected" ? "error" : "warning",
    title: status === "Rejected" ? `${s.id}: rejected by customs` : `${s.id}: on hold at customs, they need something from you`,
    lines: [
      `Your shipment ${s.id} is ${status === "On hold" ? "on hold at customs" : "rejected by customs"}${s.declaration_ref ? ` (declaration ${s.declaration_ref})` : ""}.`,
      `Reason, exactly as written by customs: "${reason}"`,
      `What to do: ${nextSteps || "Please contact your freight forwarder."}`,
      status === "Rejected" ? "You can now correct the booking and documents in Clear2Ship, then tell your forwarder what you changed." : "",
      `Who has to act: ${WHO[responsible ?? ""] ?? "To be confirmed with your freight forwarder"}`,
    ].filter(Boolean),
    actions: [{ label: status === "Rejected" ? "Correct and reply to customs" : "Reply to customs", action: "open", params: { anchor: "customs-reply" } }],
  });
}

/**
 * 24h reminder to the seller and 48h alert to the admin, timed from the oldest open problem.
 * Each is sent once per "open problem period". Safe to run as often as you like.
 */
export async function runReminders(now = new Date()) {
  const rows = await q(
    `SELECT s.id, min(i.first_seen_at) AS oldest
       FROM shipments s JOIN issues i ON i.shipment_id = s.id AND i.status = 'open'
      WHERE s.status NOT IN ('Cleared', 'Delivered')
        AND (s.status <> 'Draft' OR (s.last_check->>'inputBlocked') = 'false')
      GROUP BY s.id`,
  );
  const sent: string[] = [];
  for (const r of rows) {
    const oldest = new Date(r.oldest);
    const hours = (now.getTime() - oldest.getTime()) / 36e5;
    for (const [kind, limit] of [["reminder_24h", 24], ["admin_48h", 48]] as const) {
      if (hours < limit) continue;
      const [already] = await q("SELECT 1 FROM emails WHERE shipment_id = $1 AND kind = $2 AND sent_at >= $3", [r.id, kind, oldest]);
      if (already) continue;
      const [shipment] = await q("SELECT * FROM shipments WHERE id = $1", [r.id]);
      const issues = await q("SELECT * FROM issues WHERE shipment_id = $1", [r.id]);
      await sendIssuesEmail({ shipment, issues }, kind);
      sent.push(`${r.id}: ${kind === "reminder_24h" ? "24-hour reminder to the seller" : "48-hour alert to the admin"}`);
    }
  }
  return sent;
}

// ---------------------------------------------------------------- carrier and delivery slot requests

const dmy = (d: unknown) => {
  if (!d) return "?";
  const iso = d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
  return iso.split("-").reverse().join("-");
};

/** Each carrier's address (CARRIER_A_EMAIL, …), falling back to CARRIER_EMAIL. */
const carrierEmail = (name: string | null) =>
  (name && process.env[`CARRIER_${name.replace(/^Carrier\s+/i, "").toUpperCase()}_EMAIL`]) || process.env.CARRIER_EMAIL || null;

/** Collection request to the chosen carrier. The carrier confirms (or declines) in Clear2Ship. */
export async function sendCarrierRequestEmail(s: Row, items: Row[], again = false) {
  const subject = `${again ? "Updated collection request" : "Collection request"}: ${s.id} (${s.pallets} pallets, ${s.origin_city} → ${s.destination_city})`;
  const body = `Hello ${s.selected_carrier},

${again ? "The booking below has changed. Please confirm the collection again." : "Please confirm the collection below."}

Shipment: ${s.id} for ${s.seller_name}
Collect from: ${s.origin_city}, United Kingdom
Deliver to: ${s.destination_city}, ${s.destination_country} (${s.destination_type})
Requested collection: ${dmy(s.collection_date)}, ${s.collection_window ?? "any time"}
Load: ${s.pallets} pallets, ${s.cartons} cartons, ${Number(s.gross_weight_kg)} kg gross
Goods: ${items.map((i) => `${i.sku} ${i.description} × ${i.quantity}`).join("; ")}

Confirm or decline here (choose the Carrier role): ${appUrl()}/shipments/${s.id}

– Clear2Ship`;
  return sendEmail(s.id, "carrier_request", carrierEmail(s.selected_carrier), subject, body);
}

/** Delivery slot request to the destination warehouse, sent once the carrier has confirmed. */
export async function sendAppointmentRequestEmail(s: Row, expectedDelivery: string) {
  const subject = `Delivery slot request: ${s.id} arriving around ${expectedDelivery}`;
  const body = `Hello,

Please book a delivery slot for this inbound shipment.

Shipment: ${s.id} from ${s.seller_name}
Carrier: ${s.selected_carrier}${s.carrier_ref ? ` (ref ${s.carrier_ref})` : ""}
Collected: ${dmy(s.carrier_pickup_date)} ${s.carrier_pickup_time ?? ""}
Expected delivery: around ${expectedDelivery}
Delivery to: ${s.destination_city}, ${s.destination_country}
Load: ${s.pallets} pallets, ${s.cartons} cartons, ${Number(s.gross_weight_kg)} kg gross

Confirm or decline the slot here (choose the Warehouse role): ${appUrl()}/shipments/${s.id}

– Clear2Ship`;
  return sendEmail(s.id, "appointment_request", process.env.WAREHOUSE_EMAIL || null, subject, body);
}

/** Short update to the seller (submitted, carrier / slot confirmed or declined). */
type SellerUpdate = "submitted" | "carrier_confirmed" | "carrier_declined" | "appointment_confirmed" | "appointment_declined"
  | "appointment_proposed" | "resubmitted" | "goods_result" | "goods_rejected" | "customs_cleared" | "delivered";

const UPDATE: Record<SellerUpdate, { topic: SellerAlert["topic"]; severity: SellerAlert["severity"]; title: (s: Row) => string }> = {
  submitted: { topic: "booking", severity: "info", title: (s) => `${s.id}: booking submitted` },
  carrier_confirmed: { topic: "carrier", severity: "success", title: (s) => `${s.id}: collection booked with ${s.selected_carrier ?? "the carrier"}` },
  carrier_declined: { topic: "carrier", severity: "error", title: (s) => `${s.id}: the carrier declined. Choose another carrier` },
  appointment_confirmed: { topic: "slot", severity: "success", title: (s) => `${s.id}: delivery slot booked at the warehouse` },
  appointment_declined: { topic: "slot", severity: "error", title: (s) => `${s.id}: the warehouse declined the delivery slot` },
  appointment_proposed: { topic: "slot", severity: "warning", title: (s) => `${s.id}: the warehouse proposed a different delivery slot` },
  resubmitted: { topic: "customs", severity: "info", title: (s) => `${s.id}: resubmitted to customs` },
  goods_result: { topic: "goods", severity: "success", title: (s) => `${s.id}: goods delivered and accepted at the warehouse` },
  goods_rejected: { topic: "goods", severity: "error", title: (s) => `${s.id}: the warehouse rejected the goods` },
  customs_cleared: { topic: "customs", severity: "success", title: (s) => `${s.id}: cleared by customs` },
  delivered: { topic: "booking", severity: "success", title: (s) => `${s.id}: delivered` },
};

export async function sendSellerUpdate(s: Row, kind: SellerUpdate, lines: string[], actions: AlertAction[] = []) {
  const u = UPDATE[kind];
  return notifySeller(s, { topic: u.topic, kind, severity: u.severity, title: u.title(s), lines, actions });
}

/** The seller's answer to a customs request, for the forwarder to send on. */
export async function sendForwarderReplyEmail(s: Row, message: string, filename: string | null) {
  const subject = `${s.id}: seller's reply to customs (${s.customs_status})`;
  const body = `Hello,

${s.seller_name} has replied to the customs ${s.customs_status === "Rejected" ? "rejection" : "request"} for ${s.id} (declaration ${s.declaration_ref ?? "?"}).

Customs said: "${s.customs_reason ?? ""}"

Seller's reply:
${message}
${filename ? `\nAttached in Clear2Ship: ${filename}\n` : ""}
Please send this on to customs and record the resubmission: ${appUrl()}/shipments/${s.id}

– Clear2Ship`;
  return sendEmail(s.id, "customs_reply", process.env.FORWARDER_EMAIL || null, subject, body);
}
