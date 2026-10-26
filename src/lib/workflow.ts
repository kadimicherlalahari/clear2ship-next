// Workflow steps after booking: submit, documents, warehouse, customs declaration, customs status, delivery.
import { q } from "./db";
import { HttpError } from "./api";
import { DETAIL_FIELDS, ITEM_DETAIL_FIELDS, normaliseDetail, validateDetail, type DetailValue, type DocDetails } from "./docDetails";
import {
  resolveAlerts, sendAppointmentRequestEmail, sendCarrierRequestEmail, sendExceptionEmail, sendForwarderReplyEmail, sendSellerUpdate,
  type AlertAction,
} from "./email";
import { extractDocument, GeminiUnavailable, readCustomsEmail } from "./gemini";
import { DOC_LABEL, REQUIRED_DOCS } from "./rules/docs";
import { cleanNumber, parseDate, toDisplayDate } from "./rules/parse";
import type { DocKind, ExtractedDoc } from "./rules/types";
import { ukToday } from "./rules/rules";
import {
  getShipment, isLocked, logEvent, rankedCarriers, recheck, runAllChecks, submitReadiness, toRawBooking, updateBooking, type Actor,
} from "./shipments";

const MAX_FILE_BYTES = 4 * 1024 * 1024; // Vercel request limit is 4.5 MB
const DOC_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp", "text/plain", "text/csv"];

async function load(id: string) {
  const b = await getShipment(id);
  if (!b) throw new HttpError(404, `Shipment ${id} not found.`);
  return b;
}

// ---------------------------------------------------------------- documents

export async function uploadDocument(id: string, kind: DocKind, file: File, actor: Actor) {
  const b = await load(id);
  if (isLocked(b.shipment)) throw new HttpError(400, "This shipment has already been declared to customs, so documents can't be replaced.");
  if (!REQUIRED_DOCS.includes(kind)) throw new HttpError(400, "Choose commercial invoice or packing list.");
  if (file.size > MAX_FILE_BYTES) throw new HttpError(400, "That file is over 4 MB. Please upload a smaller PDF or image.");
  const mime = file.type || "application/octet-stream";
  if (!DOC_TYPES.includes(mime)) throw new HttpError(400, "Please upload a PDF, image (PNG/JPG) or text file.");

  const data = Buffer.from(await file.arrayBuffer());
  let extracted: ExtractedDoc | null = null;
  let readError: string | null = null;
  try {
    extracted = await extractDocument(kind, data, mime);
  } catch (e) {
    if (!(e instanceof GeminiUnavailable)) throw e;
    readError = "We couldn't read this document automatically. Please type the key fields in yourself and confirm.";
  }
  const [row] = await q(
    `INSERT INTO documents (shipment_id, kind, filename, mime_type, size_bytes, content, extracted)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [id, kind, file.name, mime, file.size, data, extracted ? JSON.stringify(extracted) : null],
  );
  await logEvent(id, actor, `Uploaded the ${DOC_LABEL[kind]} (${file.name})${readError ? "; it couldn't be read automatically" : "; fields read, waiting for the seller to confirm"}`);
  await recheck(id, actor);
  return { documentId: row.id, extracted, readError };
}

/** The seller reviews the fields read from a document (may correct them) and confirms. */
export async function confirmDocument(id: string, docId: number, extracted: ExtractedDoc, actor: Actor) {
  const [doc] = await q("SELECT * FROM documents WHERE id = $1 AND shipment_id = $2", [docId, id]);
  if (!doc) throw new HttpError(404, "Document not found.");
  const before = (doc.extracted ?? {}) as ExtractedDoc;
  const edited: string[] = [];
  for (const [k, v] of Object.entries(extracted)) {
    if (k === "items" || !v || Array.isArray(v)) continue;
    const old = (before[k] as { value: unknown } | undefined)?.value ?? null;
    const now = (v as { value: unknown }).value ?? null;
    if (String(old ?? "") !== String(now ?? "")) edited.push(`${k.replaceAll("_", " ")}: ${old ?? "blank"} → ${now ?? "blank"}`);
  }
  await q("UPDATE documents SET extracted = $2, confirmed_at = now() WHERE id = $1", [docId, JSON.stringify(extracted)]);
  const filled = await fillDetailsFromDocument(id, doc.kind as DocKind, extracted);
  await logEvent(id, actor, `Confirmed the fields read from the ${DOC_LABEL[doc.kind as DocKind]}${edited.length ? ` (corrected: ${edited.join("; ")})` : ""}${filled.length ? `. Filled in from it: ${filled.join(", ")}` : ""}`);
  return recheck(id, actor);
}

// ---------------------------------------------------------------- submit, carrier and delivery slot

const fmtDate = (iso: string) => toDisplayDate(iso);
const isoOf = (d: unknown) => (d instanceof Date ? d.toISOString().slice(0, 10) : d ? String(d).slice(0, 10) : null);

/** Submit: only when every item of the checklist is done. Sends the collection request to the chosen carrier. */
export async function submitBooking(id: string, actor: Actor, input: { summaryConfirmed?: boolean; collection_date?: string; collection_window?: string }) {
  const b = await load(id);
  const s = b.shipment;
  if (s.submitted_at) throw new HttpError(400, "This booking has already been submitted.");
  const check = runAllChecks(b);
  const readiness = submitReadiness(b, check);
  const notDone = readiness.items.filter((i) => !i.ok && !i.warning);
  if (notDone.length) throw new HttpError(400, `Not ready to submit yet: ${notDone.map((i) => i.label).join("; ")}.`);
  if (!input.summaryConfirmed) throw new HttpError(400, "Please tick that you've checked the booking summary.");
  const date = parseDate(input.collection_date ?? "");
  if (!date) throw new HttpError(400, "Please enter the collection date as DD-MM-YYYY.");
  const ready = isoOf(s.ready_date)!;
  if (date < ready) throw new HttpError(400, `The collection date can't be before the ready date (${fmtDate(ready)}).`);
  if (date < ukToday()) throw new HttpError(400, "The collection date can't be in the past.");
  const window = (input.collection_window ?? "").trim();
  if (!window) throw new HttpError(400, "Please choose a collection time.");

  const appointment = s.destination_type !== "Warehouse" ? "not_needed" : s.appointment_booked ? "seller_booked" : null;
  await q(
    `UPDATE shipments SET submitted_at = now(), collection_date = $2, collection_window = $3, carrier_status = 'requested',
       appointment_status = $4 WHERE id = $1`,
    [id, date, window, appointment],
  );
  const p = rankedCarriers(check).find((c) => c.name === s.selected_carrier)!;
  await logEvent(id, actor, `Submitted the booking with ${s.selected_carrier} (£${p.price.toLocaleString("en-GB")}, ${p.transitDays} days); collection requested for ${fmtDate(date)}, ${window}`);
  const fresh = (await load(id));
  await sendCarrierRequestEmail(fresh.shipment, fresh.items);
  await sendSellerUpdate(fresh.shipment, "submitted", [
    `Your booking ${id} has been submitted.`,
    `We've asked ${s.selected_carrier} to confirm the collection on ${fmtDate(date)} (${window}).`,
    appointment === null ? "Once they confirm, we'll ask the warehouse for a delivery slot." :
      appointment === "seller_booked" ? "You told us a delivery slot at the warehouse is already booked." : "",
    "Nothing is booked until the carrier confirms. We'll email you when they do.",
  ].filter(Boolean));
  return recheck(id, actor);
}

/** The seller chooses a carrier from the ranked list (before submit, or after a carrier declined). */
export async function selectCarrier(id: string, name: string, actor: Actor) {
  const b = await load(id);
  const s = b.shipment;
  if (s.submitted_at && s.carrier_status !== "declined") throw new HttpError(400, "The carrier can't be changed after submitting, unless the carrier declines.");
  const check = runAllChecks(b);
  const option = rankedCarriers(check).find((c) => c.name === name);
  if (!option) throw new HttpError(400, `${name} can't take this load. Choose one of the carriers shown.`);
  if (((s.declined_carriers ?? []) as string[]).includes(name)) throw new HttpError(400, `${name} already declined this collection. Choose another carrier.`);
  if (s.selected_carrier === name) return check;
  await q("UPDATE shipments SET selected_carrier = $2 WHERE id = $1", [id, name]);
  const top = rankedCarriers(check)[0];
  await logEvent(id, actor, `Chose ${name} (£${option.price.toLocaleString("en-GB")}, ${option.transitDays} days, ${option.onTimePct}% on time)${top.name !== name ? `; recommended was ${top.name}` : ""}`);
  return recheck(id, actor);
}

/** Regenerate the recommendations for a different priority (cost, speed, reliability or balanced). */
export async function changePriority(id: string, priority: string, actor: Actor) {
  const b = await load(id);
  if (b.shipment.submitted_at && b.shipment.carrier_status !== "declined") throw new HttpError(400, "The carrier can't be changed after submitting, unless the carrier declines.");
  const raw = toRawBooking(b.shipment, b.items);
  raw.seller_priority = priority;
  return updateBooking(id, raw, actor, "Regenerated the carrier recommendations");
}

/** After a decline: send the collection request to the newly chosen carrier. */
export async function resendCarrierRequest(id: string, actor: Actor) {
  const b = await load(id);
  const s = b.shipment;
  if (s.carrier_status !== "declined") throw new HttpError(400, "A new request is only needed after a carrier declines.");
  const check = runAllChecks(b);
  if (!s.selected_carrier || !rankedCarriers(check).some((c) => c.name === s.selected_carrier)) throw new HttpError(400, "Choose a carrier first.");
  await q("UPDATE shipments SET carrier_status = 'requested', carrier_note = NULL WHERE id = $1", [id]);
  await logEvent(id, actor, `Sent a new collection request to ${s.selected_carrier}`);
  const fresh = await load(id);
  await sendCarrierRequestEmail(fresh.shipment, fresh.items);
  await resolveAlerts(id, "carrier");
  return recheck(id, actor);
}

/** After a decline, in one step (e.g. from the alert): choose this carrier and send it the collection request. */
export async function rebookCarrier(id: string, carrier: string, actor: Actor) {
  const b = await load(id);
  if (b.shipment.carrier_status !== "declined") throw new HttpError(400, "This collection isn't waiting for a new carrier any more.");
  await selectCarrier(id, carrier, actor);
  return resendCarrierRequest(id, actor);
}

/** The next-best carriers after one declined, for the alert's "Book …" buttons. */
async function nextCarrierActions(id: string): Promise<AlertAction[]> {
  const b = await load(id);
  const declined = (b.shipment.declined_carriers ?? []) as string[];
  const options = rankedCarriers(runAllChecks(b)).filter((c) => !declined.includes(c.name)).slice(0, 2);
  return [
    ...options.map((c, i): AlertAction => ({
      label: `Book ${c.name}${i === 0 ? " (recommended)" : ""}: £${c.price.toLocaleString("en-GB")}, ${c.transitDays} days, ${c.onTimePct}% on time`,
      action: "rebook-carrier", params: { carrier: c.name },
    })),
    { label: "See all carriers", action: "open", params: { anchor: "carrier" } },
  ];
}

/** The carrier confirms the collection (date, time, reference) or declines it. */
export async function carrierRespond(id: string, input: { act?: string; pickup_date?: string; pickup_time?: string; ref?: string; note?: string }, actor: Actor) {
  const b = await load(id);
  const s = b.shipment;
  if (s.carrier_status !== "requested") throw new HttpError(400, "There's no open collection request for this shipment.");
  if (input.act === "decline") {
    const note = (input.note ?? "").trim();
    if (!note) throw new HttpError(400, "Please say why the collection is declined.");
    const declined = [...new Set([...((s.declined_carriers ?? []) as string[]), s.selected_carrier])];
    await q("UPDATE shipments SET carrier_status = 'declined', carrier_note = $2, selected_carrier = NULL, declined_carriers = $3 WHERE id = $1",
      [id, `${s.selected_carrier}: ${note}`, JSON.stringify(declined)]);
    await logEvent(id, actor, `${s.selected_carrier} declined the collection: ${note}`);
    const next = await nextCarrierActions(id);
    await sendSellerUpdate(s, "carrier_declined", [
      `${s.selected_carrier} declined the collection for ${id}.`,
      `Reason: "${note}"`,
      next.length > 1 ? "Book the next-best carrier below. The collection request is sent to them straight away." : "No other carrier can take this load. Please open the shipment.",
    ], next);
    return recheck(id, actor);
  }
  const date = parseDate(input.pickup_date ?? "");
  if (!date) throw new HttpError(400, "Please enter the collection date as DD-MM-YYYY.");
  if (date < isoOf(s.ready_date)!) throw new HttpError(400, `The collection date can't be before the ready date (${fmtDate(isoOf(s.ready_date)!)}).`);
  const time = (input.pickup_time ?? "").trim();
  if (!time) throw new HttpError(400, "Please enter the collection time.");
  const ref = (input.ref ?? "").trim();
  if (!ref) throw new HttpError(400, "Please enter your booking reference.");
  await q(
    "UPDATE shipments SET carrier_status = 'confirmed', carrier_pickup_date = $2, carrier_pickup_time = $3, carrier_ref = $4, carrier_confirmed_at = now() WHERE id = $1",
    [id, date, time, ref],
  );
  await logEvent(id, actor, `${s.selected_carrier} confirmed the collection: ${fmtDate(date)} at ${time} (ref ${ref})`);
  await sendSellerUpdate(s, "carrier_confirmed", [`${s.selected_carrier} has booked the collection for ${id}.`, `Collection: ${fmtDate(date)} at ${time}`, `Carrier reference: ${ref}`]);

  // With the carrier's confirmation, ask the destination warehouse for a delivery slot.
  if (s.destination_type === "Warehouse" && !["seller_booked", "confirmed"].includes(s.appointment_status ?? "")) {
    const etaText = expectedDelivery(b, date);
    await q("UPDATE shipments SET appointment_status = 'requested', appointment_note = NULL WHERE id = $1", [id]);
    await logEvent(id, { role: "system" }, `Asked the warehouse in ${s.destination_city} for a delivery slot around ${etaText}`);
    await sendAppointmentRequestEmail((await load(id)).shipment, etaText);
  }
  return recheck(id, actor);
}

/** Collection date + the chosen carrier's transit days, as DD-MM-YYYY. */
function expectedDelivery(b: Awaited<ReturnType<typeof load>>, collectionIso: string) {
  const days = rankedCarriers(runAllChecks(b)).find((c) => c.name === b.shipment.selected_carrier)?.transitDays ?? 0;
  const eta = new Date(`${collectionIso}T00:00:00Z`);
  eta.setUTCDate(eta.getUTCDate() + days);
  return fmtDate(eta.toISOString().slice(0, 10));
}

/** The destination warehouse confirms the delivery slot or declines it. */
export async function appointmentRespond(id: string, input: { act?: string; date?: string; time?: string; ref?: string; note?: string }, actor: Actor) {
  const b = await load(id);
  const s = b.shipment;
  if (s.appointment_status !== "requested") throw new HttpError(400, "There's no open delivery slot request for this shipment.");
  if (input.act === "decline") {
    const note = (input.note ?? "").trim();
    if (!note) throw new HttpError(400, "Please say why the slot is declined.");
    await q("UPDATE shipments SET appointment_status = 'declined', appointment_note = $2 WHERE id = $1", [id, note]);
    await logEvent(id, actor, `Declined the delivery slot request: ${note}`);
    await sendSellerUpdate(s, "appointment_declined", [`The warehouse declined the delivery slot for ${id}.`, `Reason: "${note}"`, "Send a new delivery slot request below."],
      [{ label: "Send a new slot request", action: "request-slot", params: {} }]);
    return recheck(id, actor);
  }
  const date = parseDate(input.date ?? "");
  if (!date) throw new HttpError(400, "Please enter the slot date as DD-MM-YYYY.");
  const pickup = isoOf(s.carrier_pickup_date);
  if (pickup && date < pickup) throw new HttpError(400, `The delivery slot can't be before the collection date (${fmtDate(pickup)}).`);
  const time = (input.time ?? "").trim();
  if (!time) throw new HttpError(400, "Please enter the slot time.");
  const ref = (input.ref ?? "").trim();
  if (!ref) throw new HttpError(400, "Please enter the appointment reference.");
  if (input.act === "propose") {
    // The warehouse can't take the requested day: it offers another slot, which the seller accepts or declines.
    const note = (input.note ?? "").trim();
    await q(
      "UPDATE shipments SET appointment_status = 'proposed', appointment_date = $2, appointment_time = $3, appointment_ref = $4, appointment_note = $5 WHERE id = $1",
      [id, date, time, ref, note || null],
    );
    await logEvent(id, actor, `Proposed a different delivery slot: ${fmtDate(date)} at ${time} (ref ${ref})${note ? ` – ${note}` : ""}`);
    await sendSellerUpdate(s, "appointment_proposed", [
      `The warehouse in ${s.destination_city} can't take ${id} at the requested time and has offered another slot:`,
      `${fmtDate(date)} at ${time} (ref ${ref})${note ? `. Note: "${note}"` : ""}`,
      "Accept it, or ask for another time:",
    ], [
      { label: `Accept ${fmtDate(date)} at ${time}`, action: "answer-slot", params: { accept: true } },
      { label: "Ask for another time", action: "answer-slot", params: { accept: false } },
    ]);
    return recheck(id, actor);
  }
  await q(
    `UPDATE shipments SET appointment_status = 'confirmed', appointment_date = $2, appointment_time = $3, appointment_ref = $4,
       appointment_confirmed_at = now(), appointment_booked = true WHERE id = $1`,
    [id, date, time, ref],
  );
  await logEvent(id, actor, `Confirmed the delivery slot: ${fmtDate(date)} at ${time} (ref ${ref})`);
  await sendSellerUpdate(s, "appointment_confirmed", [`The warehouse in ${s.destination_city} has booked a delivery slot for ${id}.`, `Slot: ${fmtDate(date)} at ${time}`, `Appointment reference: ${ref}`]);
  return recheck(id, actor);
}

/** The seller accepts or declines a slot the warehouse proposed. */
export async function answerProposedSlot(id: string, accept: boolean, actor: Actor) {
  await resolveAlerts(id, "slot");
  const b = await load(id);
  const s = b.shipment;
  if (s.appointment_status !== "proposed") throw new HttpError(400, "There's no proposed delivery slot to answer.");
  const when = `${fmtDate(isoOf(s.appointment_date)!)} at ${s.appointment_time}`;
  if (accept) {
    await q("UPDATE shipments SET appointment_status = 'confirmed', appointment_confirmed_at = now(), appointment_booked = true WHERE id = $1", [id]);
    await logEvent(id, actor, `Accepted the delivery slot the warehouse proposed: ${when} (ref ${s.appointment_ref})`);
    await sendSellerUpdate(s, "appointment_confirmed", [`The delivery slot for ${id} is booked: ${when}`, `Appointment reference: ${s.appointment_ref}`]);
  } else {
    await q("UPDATE shipments SET appointment_status = 'requested', appointment_date = NULL, appointment_time = NULL, appointment_ref = NULL, appointment_note = NULL WHERE id = $1", [id]);
    await logEvent(id, actor, `Declined the proposed delivery slot (${when}) and asked the warehouse for another time`);
    await sendAppointmentRequestEmail((await load(id)).shipment, expectedDelivery(b, isoOf(s.carrier_pickup_date) ?? isoOf(s.collection_date)!));
  }
  return recheck(id, actor);
}

export async function requestNewSlot(id: string, actor: Actor) {
  await resolveAlerts(id, "slot");
  const b = await load(id);
  const s = b.shipment;
  if (s.appointment_status !== "declined") throw new HttpError(400, "A new slot request is only needed after the warehouse declines.");
  await q("UPDATE shipments SET appointment_status = 'requested', appointment_note = NULL WHERE id = $1", [id]);
  await logEvent(id, actor, "Sent a new delivery slot request to the warehouse");
  await sendAppointmentRequestEmail((await load(id)).shipment, expectedDelivery(b, isoOf(s.carrier_pickup_date) ?? isoOf(s.collection_date)!));
  return recheck(id, actor);
}

// ---------------------------------------------------------------- fixing problems right where they are shown

export type FixValue = { sku?: string; index?: number; field: string; value: unknown };

/**
 * Apply the seller's fix for one problem. The fix is tried first: if the problem is still there
 * (e.g. an HS code with only 5 digits), nothing is saved and the seller is told why.
 */
export async function fixIssue(id: string, issueKey: string, values: FixValue[], actor: Actor) {
  const b = await load(id);
  if (!values.length) throw new HttpError(400, "Please enter a value.");
  const raw = toRawBooking(b.shipment, b.items);
  for (const v of values) {
    if (v.sku !== undefined || v.index !== undefined) {
      const idx = v.sku !== undefined ? raw.items!.findIndex((i) => String(i.sku ?? "") === v.sku) : v.index!;
      if (idx < 0 || !raw.items![idx]) throw new HttpError(400, `Item ${v.sku ?? (v.index ?? 0) + 1} not found.`);
      if (v.field === "__remove") raw.items!.splice(idx, 1);
      else raw.items![idx][v.field] = typeof v.value === "string" ? v.value.trim() : v.value;
    } else {
      raw[v.field] = typeof v.value === "string" ? v.value.trim() : v.value;
    }
  }
  const before = runAllChecks(b);
  const after = runAllChecks(b, raw);
  // A value that isn't valid for its field (e.g. "abc" for pallets) is refused with the input-check message.
  const fieldErrors = after.issues.filter((i) => i.kind === "ERROR" && !before.issues.some((x) => x.key === i.key));
  if (fieldErrors.length) throw new HttpError(400, `Not saved: ${fieldErrors.map((e) => e.message).join(" ")}`);
  const still = after.allIssues.find((i) => i.key === issueKey);
  if (still) throw new HttpError(400, `Not saved: ${still.message} ${still.fix}`);
  const code = issueKey.split(":")[0];
  return updateBooking(id, raw, actor, `Fixed ${code === "INPUT" ? "a missing detail" : code}`);
}

/**
 * Document mismatch, option 3: the value was read wrong from the document. The seller enters what the
 * document really says. Kept next to the original reading, marked "corrected by the seller", and logged.
 */
export async function correctReadValue(id: string, issueKey: string, value: unknown, actor: Actor) {
  const b = await load(id);
  if (isLocked(b.shipment)) throw new HttpError(400, "This shipment has already been declared to customs, so documents can't be changed.");
  const issue = runAllChecks(b).allIssues.find((i) => i.key === issueKey);
  if (!issue?.compare) throw new HttpError(400, "That mismatch is no longer open.");
  const c = issue.compare;
  const n = cleanNumber(value);
  if (isNaN(n) || n <= 0) throw new HttpError(400, `${c.what} must be a number above 0.`);
  if ((c.unit === "units" || c.unit === "cartons") && !Number.isInteger(n)) throw new HttpError(400, `${c.what} must be a whole number.`);
  if (n === c.docValue) throw new HttpError(400, `That's the value already read from the ${DOC_LABEL[c.docKind]} (${c.docValue}). If it really says that, choose "The ${DOC_LABEL[c.docKind]} is right" or "The booking is right" instead.`);
  const doc = b.documents.filter((d) => d.kind === c.docKind).at(-1);
  if (!doc) throw new HttpError(400, "Document not found.");
  const extracted = { ...(doc.extracted ?? {}) };
  const before = extracted[c.docField] as { value?: unknown; source?: string; original_value?: unknown; original_source?: string } | undefined;
  extracted[c.docField] = {
    value: String(n),
    source: `Corrected by the seller (read as ${c.docValue})`,
    corrected_by_seller: true,
    original_value: before?.original_value ?? before?.value ?? c.docValue,
    original_source: before?.original_source ?? before?.source ?? null,
    corrected_by: actor.name ? `${actor.role} (${actor.name})` : actor.role,
    corrected_at: new Date().toISOString(),
  };
  await q("UPDATE documents SET extracted = $2 WHERE id = $1", [doc.id, JSON.stringify(extracted)]);
  await logEvent(id, actor, `Corrected a value read wrong from the ${DOC_LABEL[c.docKind]}: ${c.what} ${c.docValue} → ${n}${before?.source ? ` (the words read were "${before.source}")` : ""}`);
  return recheck(id, actor);
}

/** The seller ticks an AMBER item as checked. Recorded with the exact message they saw. */
export async function acknowledgeIssue(id: string, issueKey: string, actor: Actor) {
  const b = await load(id);
  const check = runAllChecks(b);
  const issue = check.allIssues.find((i) => i.key === issueKey);
  if (!issue) throw new HttpError(400, "That item is no longer open.");
  if (issue.severity !== "AMBER") throw new HttpError(400, "RED problems must be fixed, they can't be ticked.");
  const ack = { ...(b.shipment.acknowledged ?? {}), [issueKey]: { message: issue.message, by: actor.name ? `${actor.role} (${actor.name})` : actor.role, at: new Date().toISOString() } };
  await q("UPDATE shipments SET acknowledged = $2 WHERE id = $1", [id, JSON.stringify(ack)]);
  await logEvent(id, actor, `Checked and accepted: ${issue.code} ${issue.message}`);
  return recheck(id, actor);
}

// ---------------------------------------------------------------- document details (fields the booking doesn't cover)

const DETAIL_LABEL = Object.fromEntries([...DETAIL_FIELDS, ...ITEM_DETAIL_FIELDS].map((f) => [f.key, f.label]));

/** Save document details typed by the seller. Every value is checked; invalid ones are refused. */
export async function saveDocDetails(id: string, values: { key: string; sku?: string; value: string }[], actor: Actor) {
  const b = await load(id);
  if (b.shipment.submitted_at) throw new HttpError(400, "The booking has been submitted, so document details can't be changed.");
  const details: DocDetails = { ...(b.shipment.doc_details ?? {}) };
  details.items = { ...(details.items ?? {}) };
  const changed: string[] = [];
  for (const v of values) {
    if (!DETAIL_LABEL[v.key]) throw new HttpError(400, `Unknown field ${v.key}.`);
    const err = validateDetail(v.key, v.value ?? "");
    const label = v.sku ? `${v.sku}: ${DETAIL_LABEL[v.key]}` : DETAIL_LABEL[v.key];
    if (err) throw new HttpError(400, `Not saved: ${label}: ${err}`);
    const value = normaliseDetail(v.key, v.value);
    const entry = { value, source: "Entered by the seller" };
    if (v.sku) {
      if (!b.items.some((i) => i.sku === v.sku)) throw new HttpError(400, `Item ${v.sku} not found.`);
      const old = details.items[v.sku]?.[v.key]?.value;
      if (old === value) continue;
      details.items[v.sku] = { ...(details.items[v.sku] ?? {}), [v.key]: entry };
      changed.push(`${label}: ${old ?? "blank"} → ${value}`);
    } else {
      const old = (details[v.key] as DetailValue | undefined)?.value;
      if (old === value) continue;
      details[v.key] = entry;
      changed.push(`${label}: ${old ?? "blank"} → ${value}`);
    }
  }
  if (!changed.length) return { changed };
  await q("UPDATE shipments SET doc_details = $2 WHERE id = $1", [id, JSON.stringify(details)]);
  await logEvent(id, actor, `Document details: ${changed.join("; ")}`);
  await recheck(id, actor);
  return { changed };
}

/** When a document is confirmed, copy what it says into any document details that are still blank. */
async function fillDetailsFromDocument(id: string, kind: DocKind, extracted: ExtractedDoc): Promise<string[]> {
  const [row] = await q("SELECT doc_details FROM shipments WHERE id = $1", [id]);
  const details: DocDetails = { ...(row?.doc_details ?? {}) };
  details.items = { ...(details.items ?? {}) };
  const filled: string[] = [];
  const from = `From the ${DOC_LABEL[kind]}`;
  const val = (f: unknown) => {
    const x = f as { value?: unknown; source?: string } | undefined;
    return x && x.value !== null && x.value !== undefined && String(x.value).trim() !== "" ? { v: String(x.value).trim(), src: x.source ?? "" } : null;
  };
  if (kind === "commercial_invoice") {
    for (const f of DETAIL_FIELDS) {
      const got = f.fromInvoice ? val(extracted[f.fromInvoice]) : null;
      if (!got || details[f.key]) continue;
      const ok = !validateDetail(f.key, got.v);
      details[f.key] = { value: ok ? normaliseDetail(f.key, got.v) : got.v, source: `${from}: "${got.src}"` };
      filled.push(f.label);
    }
  } else {
    for (const it of (extracted.items ?? []) as Record<string, unknown>[]) {
      const sku = val(it.sku)?.v;
      if (!sku) continue;
      for (const f of ITEM_DETAIL_FIELDS) {
        const got = val(it[f.key]);
        if (!got || details.items[sku]?.[f.key]) continue;
        details.items[sku] = { ...(details.items[sku] ?? {}), [f.key]: { value: got.v, source: `${from}: "${got.src}"` } };
        filled.push(`${sku} ${f.label.toLowerCase()}`);
      }
    }
  }
  if (filled.length) await q("UPDATE shipments SET doc_details = $2 WHERE id = $1", [id, JSON.stringify(details)]);
  return filled;
}

// ---------------------------------------------------------------- warehouse

export async function warehouseDecision(id: string, result: "accepted" | "mismatch", note: string, actor: Actor) {
  const b = await load(id);
  if (!b.shipment.submitted_at) throw new HttpError(400, "The seller hasn't submitted this booking yet.");
  if (b.shipment.declaration_ref) throw new HttpError(400, "This shipment has already been declared to customs.");
  if (b.shipment.destination_type === "Warehouse" && !["confirmed", "seller_booked"].includes(b.shipment.appointment_status ?? "")) {
    throw new HttpError(400, "The delivery slot isn't confirmed yet, so the goods can't be received.");
  }
  if (result === "mismatch" && !note.trim()) throw new HttpError(400, "Please add a note saying what doesn't match.");
  await q("UPDATE shipments SET warehouse_result = $2, warehouse_note = $3, goods_received_at = now() WHERE id = $1", [id, result, note.trim() || null]);
  await logEvent(id, actor, result === "accepted"
    ? `Received and accepted the goods: they match the booking${note.trim() ? ` (note: ${note.trim()})` : ""}`
    : `Rejected the goods / flagged a mismatch: ${note.trim()}`);
  if (result === "accepted") {
    await resolveAlerts(id, "goods");
    await sendSellerUpdate(b.shipment, "goods_result", [`The warehouse received ${id} and the goods match the booking.`, "It now goes to your freight forwarder for customs."]);
  } else {
    await sendSellerUpdate(b.shipment, "goods_rejected", [
      `The warehouse in ${b.shipment.destination_city} rejected the goods for ${id}.`,
      `Reason from the warehouse: "${note.trim()}"`,
      "What to do: check what was shipped. If the booking is wrong, correct it in Clear2Ship (the warehouse is then asked to check again). If goods are missing, arrange to send them and tell the warehouse.",
    ], [{ label: "Correct the booking", action: "open", params: { anchor: "checks" } }]);
  }
  return recheck(id, actor);
}

// ---------------------------------------------------------------- customs declaration (recorded, never submitted by the app)

export async function recordDeclaration(id: string, ref: string, date: string, actor: Actor) {
  const b = await load(id);
  const check = runAllChecks(b);
  if (b.shipment.status !== "Ready for customs") throw new HttpError(400, `This can only be done when the shipment is Ready for customs (it's ${b.shipment.status}).`);
  if (!check.readyForCustoms) throw new HttpError(400, "There are still RED problems on this shipment. They must be fixed first.");
  if (!ref.trim()) throw new HttpError(400, "Please enter the declaration reference number.");
  const iso = parseDate(date);
  if (!iso) throw new HttpError(400, "Please enter the date as DD-MM-YYYY.");
  await q("UPDATE shipments SET declaration_ref = $2, declaration_date = $3 WHERE id = $1", [id, ref.trim(), iso]);
  await logEvent(id, actor, `Declaration submitted (ref ${ref.trim()}, ${toDisplayDate(iso)})`);
  return recheck(id, actor);
}

// ---------------------------------------------------------------- customs / forwarder emails

export async function pasteCustomsEmail(id: string, text: string, actor: Actor) {
  const b = await load(id);
  if (!b.shipment.declaration_ref) throw new HttpError(400, "Record the declaration first, then paste customs emails.");
  if (text.trim().length < 10) throw new HttpError(400, "Please paste the whole email.");
  let suggestion = null;
  let readError: string | null = null;
  try {
    suggestion = await readCustomsEmail(text);
  } catch (e) {
    if (!(e instanceof GeminiUnavailable)) throw e;
    readError = "We couldn't read this email automatically. Please choose the status and copy the reason yourself.";
  }
  const [row] = await q(
    `INSERT INTO customs_messages (shipment_id, raw_text, suggested_status, suggested_reason, suggested_next_steps, suggested_responsible, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [id, text, suggestion?.status ?? null, suggestion?.reason ?? null, suggestion?.next_steps ?? null, suggestion?.responsible ?? null, actor.role],
  );
  await logEvent(id, actor, `Pasted a customs email${suggestion?.status ? ` (suggested status: ${suggestion.status}, not applied until confirmed)` : ""}`);
  return { messageId: row.id, suggestion, readError };
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** A person confirms (or dismisses) the suggested customs status. Only then does the status change. */
export async function confirmCustomsStatus(
  id: string, messageId: number,
  input: { status?: string; reason?: string; next_steps?: string; responsible?: string; dismiss?: boolean },
  actor: Actor,
) {
  const b = await load(id);
  const [msg] = await q("SELECT * FROM customs_messages WHERE id = $1 AND shipment_id = $2", [messageId, id]);
  if (!msg) throw new HttpError(404, "Customs message not found.");
  if (msg.confirmed_at || msg.dismissed_at) throw new HttpError(400, "This message has already been handled.");
  if (input.dismiss) {
    await q("UPDATE customs_messages SET dismissed_at = now(), confirmed_by = $2 WHERE id = $1", [messageId, actor.role]);
    await logEvent(id, actor, "Dismissed the suggested customs status (no change)");
    return recheck(id, actor);
  }
  const status = input.status ?? "";
  if (!["Cleared", "On hold", "Rejected"].includes(status)) throw new HttpError(400, "Choose Cleared, On hold or Rejected.");
  const reason = (input.reason ?? "").trim();
  if (status !== "Cleared") {
    if (!reason) throw new HttpError(400, "Please copy the reason from the email.");
    if (!norm(msg.raw_text).includes(norm(reason))) throw new HttpError(400, "The reason must be copied exactly as written in the email.");
  }
  const responsible = ["seller", "warehouse", "forwarder", "admin"].includes(input.responsible ?? "") ? input.responsible! : null;
  const nextSteps = (input.next_steps ?? "").trim() || null;

  await q(
    "UPDATE customs_messages SET confirmed_status = $2, confirmed_by = $3, confirmed_at = now() WHERE id = $1",
    [messageId, status, actor.name ? `${actor.role} (${actor.name})` : actor.role],
  );
  await q(
    "UPDATE shipments SET customs_status = $2, customs_reason = $3, customs_next_steps = $4, customs_responsible = $5, customs_reply_at = NULL WHERE id = $1",
    [id, status, reason || null, status === "Cleared" ? null : nextSteps, status === "Cleared" ? null : responsible],
  );
  await logEvent(id, actor, `Confirmed customs status: ${status}${reason ? ` – "${reason}"` : ""}`, { reason, nextSteps, responsible });
  if (status !== "Cleared") await sendExceptionEmail(b.shipment, status, reason, nextSteps, responsible);
  else {
    await resolveAlerts(id, "customs");
    await sendSellerUpdate(b.shipment, "customs_cleared", [`Customs has cleared ${id}${b.shipment.declaration_ref ? ` (declaration ${b.shipment.declaration_ref})` : ""}.`, "Your forwarder will mark it as delivered when it arrives."]);
  }
  return recheck(id, actor);
}

/** Customs asked for something (or rejected it): the seller sends what's needed back to the forwarder. */
export async function sendCustomsReply(id: string, message: string, file: File | null, actor: Actor) {
  const b = await load(id);
  const s = b.shipment;
  if (!["On hold", "Rejected"].includes(s.customs_status ?? "")) throw new HttpError(400, "Customs hasn't asked for anything on this shipment.");
  if (message.trim().length < 5) throw new HttpError(400, "Please write what you're sending, or what you changed.");
  let docId: number | null = null;
  if (file) {
    if (file.size > MAX_FILE_BYTES) throw new HttpError(400, "That file is over 4 MB. Please upload a smaller PDF or image.");
    const mime = file.type || "application/octet-stream";
    if (!DOC_TYPES.includes(mime)) throw new HttpError(400, "Please upload a PDF, image (PNG/JPG) or text file.");
    const [row] = await q(
      `INSERT INTO documents (shipment_id, kind, filename, mime_type, size_bytes, content, confirmed_at)
       VALUES ($1,'supporting',$2,$3,$4,$5, now()) RETURNING id`,
      [id, file.name, mime, file.size, Buffer.from(await file.arrayBuffer())],
    );
    docId = row.id;
  }
  await q("INSERT INTO customs_replies (shipment_id, message, document_id, created_by) VALUES ($1,$2,$3,$4)", [id, message.trim(), docId, actor.role]);
  await q("UPDATE shipments SET customs_reply_at = now() WHERE id = $1", [id]);
  await resolveAlerts(id, "customs");
  await logEvent(id, actor, `Replied to customs via the forwarder: ${message.trim()}${file ? ` (attached ${file.name})` : ""}`);
  await sendForwarderReplyEmail(s, message.trim(), file?.name ?? null);
  return recheck(id, actor);
}

/** The forwarder sends the corrected / completed declaration to customs again (in their own system) and records it. */
export async function resubmitDeclaration(id: string, ref: string, date: string, actor: Actor) {
  const b = await load(id);
  const s = b.shipment;
  if (!["On hold", "Rejected"].includes(s.customs_status ?? "")) throw new HttpError(400, "Only a shipment that's on hold or rejected can be resubmitted.");
  const check = runAllChecks(b);
  if (!check.readyForCustoms) throw new HttpError(400, "There are still RED problems on this shipment. The seller must fix them first.");
  if (!ref.trim()) throw new HttpError(400, "Please enter the declaration reference number.");
  const iso = parseDate(date);
  if (!iso) throw new HttpError(400, "Please enter the date as DD-MM-YYYY.");
  await q(
    `UPDATE shipments SET declaration_ref = $2, declaration_date = $3, customs_status = NULL, customs_reason = NULL,
       customs_next_steps = NULL, customs_responsible = NULL, customs_reply_at = NULL WHERE id = $1`,
    [id, ref.trim(), iso],
  );
  await logEvent(id, actor, `Resubmitted to customs (ref ${ref.trim()}, ${toDisplayDate(iso)}), previously ${s.customs_status}`);
  await sendSellerUpdate(s, "resubmitted", [`Your forwarder has resubmitted ${id} to customs (ref ${ref.trim()}).`, "We'll let you know as soon as customs replies."]);
  return recheck(id, actor);
}

export async function markDelivered(id: string, actor: Actor) {
  const b = await load(id);
  if (b.shipment.status !== "Cleared") throw new HttpError(400, "Only cleared shipments can be marked as delivered.");
  await q("UPDATE shipments SET status = 'Delivered', pending_action = NULL, responsible_role = NULL WHERE id = $1", [id]);
  await logEvent(id, actor, "Marked as delivered");
  await sendSellerUpdate(b.shipment, "delivered", [`${id} has been delivered to ${b.shipment.destination_city}.`]);
  await logEvent(id, { role: "system" }, "Status changed from Cleared to Delivered");
}
