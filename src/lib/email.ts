// Emails. With RESEND_API_KEY set they are sent through Resend; without it they are only saved
// to the emails table and shown in the app's Outbox (for running locally).
import { Resend } from "resend";
import { q, type Row } from "./db";
import { DOC_LABEL } from "./rules/docs";

type Bundle = { shipment: Row; issues: Row[] };

const WHO: Record<string, string> = { seller: "You (the seller)", warehouse: "The warehouse", forwarder: "Your freight forwarder", carrier: "The carrier", admin: "The Clear2Ship admin" };
const appUrl = () => process.env.APP_URL || "http://localhost:3000";

export type EmailKind =
  | "issues" | "reminder_24h" | "admin_48h" | "exception" | "submitted"
  | "carrier_request" | "carrier_confirmed" | "carrier_declined"
  | "appointment_request" | "appointment_confirmed" | "appointment_declined" | "appointment_proposed"
  | "customs_reply" | "resubmitted" | "goods_result";

export async function sendEmail(shipmentId: string, kind: EmailKind, to: string | null, subject: string, body: string) {
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
    [shipmentId, `Email "${subject}" ${providerId ? "sent" : "saved to the Outbox"} (to ${toAddress})`],
  );
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
  const subject = reminder
    ? `Reminder: ${s.id} still needs your attention`
    : missingDocs.length
      ? `${s.id}: please upload the ${missingDocs.join(" and ")}`
      : `${s.id}: ${reds.length ? "a few things to fix before customs" : "a few things to check"}`;
  const body = `Hi ${s.seller_name ?? "there"},

${reminder ? "Just a reminder: these are still open on" : "We checked"} your shipment ${s.id} (${s.origin_city ?? "?"} → ${s.destination_city ?? "?"})${reminder ? " after 24 hours." : " and found a few things that need your attention."}

${text}Once you've made the changes, we'll run the checks again automatically.

Open the shipment: ${link}

These checks are not a customs clearance. Nothing has been booked.

– Clear2Ship`;
  return sendEmail(s.id, kind, s.seller_email, subject, body);
}

/** Customs on hold / rejected: the reason exactly as written, the next steps and who is responsible. */
export async function sendExceptionEmail(s: Row, status: string, reason: string, nextSteps: string | null, responsible: string | null) {
  const subject = `${s.id}: customs status is now "${status}"`;
  const body = `Hi ${s.seller_name ?? "there"},

Your shipment ${s.id} is ${status === "On hold" ? "on hold at customs" : "rejected by customs"}${s.declaration_ref ? ` (declaration ${s.declaration_ref})` : ""}.

Reason, exactly as written in the customs message:
"${reason}"

Next steps: ${nextSteps || "Please contact your freight forwarder."}
Who is responsible: ${WHO[responsible ?? ""] ?? "To be confirmed with your freight forwarder"}

Open the shipment: ${appUrl()}/shipments/${s.id}

– Clear2Ship`;
  return sendEmail(s.id, "exception", s.seller_email, subject, body);
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
  | "appointment_proposed" | "resubmitted" | "goods_result";

export async function sendSellerUpdate(s: Row, kind: SellerUpdate, lines: string[]) {
  const subjects: Record<SellerUpdate, string> = {
    appointment_proposed: `${s.id}: the warehouse proposed a different delivery slot`,
    resubmitted: `${s.id}: resubmitted to customs`,
    goods_result: `${s.id}: goods received by the warehouse`,
    submitted: `${s.id}: booking submitted`,
    carrier_confirmed: `${s.id}: collection confirmed by ${s.selected_carrier ?? "the carrier"}`,
    carrier_declined: `${s.id}: the carrier declined the collection`,
    appointment_confirmed: `${s.id}: delivery slot confirmed`,
    appointment_declined: `${s.id}: the warehouse declined the delivery slot`,
  };
  const body = `Hi ${s.seller_name ?? "there"},

${lines.join("\n")}

Open the shipment: ${appUrl()}/shipments/${s.id}

– Clear2Ship`;
  return sendEmail(s.id, kind, s.seller_email, subjects[kind], body);
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
