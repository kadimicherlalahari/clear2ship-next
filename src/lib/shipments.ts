// Shipment service: load, save, re-check, status and timeline. All decisions here are plain code.
import { q, type Row } from "./db";
import { BOOKING_LABELS, ITEM_LABELS } from "./rules/constants";
import { checkDocuments } from "./rules/docs";
import { fmt } from "./rules/format";
import { parseBooking, toDisplayDate } from "./rules/parse";
import { checkBooking, ukToday } from "./rules/rules";
import type { CheckResult, DocInfo, Issue, RawBooking, RawItem } from "./rules/types";
import { resolveAlerts, sendCarrierRequestEmail, sendIssuesEmail } from "./email";
import { missingDetails } from "./docDetails";

export type Actor = { role: "seller" | "warehouse" | "forwarder" | "carrier" | "admin" | "system"; name?: string | null };

export const STATUSES = [
  "Draft", "Docs submitted", "Warehouse accepted", "Mismatch", "Action required", "Ready for customs",
  "Declaration submitted", "Cleared", "On hold", "Rejected", "Delivered",
] as const;
export type Status = (typeof STATUSES)[number];

export const BOOKING_COLUMNS = [
  "seller_name", "origin_city", "origin_country", "destination_city", "destination_country", "destination_type",
  "ready_date", "seller_priority", "pallets", "cartons", "declared_value", "currency", "gross_weight_kg",
  "appointment_booked", "preferred_carrier",
] as const;
export const ITEM_COLUMNS = [
  "sku", "description", "hs_code", "quantity", "units_per_carton", "cartons", "unit_price", "unit_weight_kg", "country_of_origin",
] as const;

/** After the declaration, the booking is locked, except while customs has it on hold or rejected (the seller must fix it). */
export const isLocked = (s: Row) => !!s.declaration_ref && !["On hold", "Rejected"].includes(s.customs_status ?? "");

// ---------------------------------------------------------------- timeline

export async function logEvent(shipmentId: string, actor: Actor, action: string, details: object | null = null) {
  await q(
    "INSERT INTO events (shipment_id, actor_role, actor_name, action, details) VALUES ($1,$2,$3,$4,$5)",
    [shipmentId, actor.role, actor.name || null, action, details ? JSON.stringify(details) : null],
  );
  await q("UPDATE shipments SET updated_at = now() WHERE id = $1", [shipmentId]);
}

// ---------------------------------------------------------------- load

export async function nextShipmentId(): Promise<string> {
  const rows = await q("SELECT id FROM shipments WHERE id ~ '^BK-[0-9]+$'");
  const max = rows.reduce((m, r) => Math.max(m, Number(String(r.id).slice(3))), 0);
  return `BK-${String(max + 1).padStart(3, "0")}`;
}

export async function getShipment(id: string) {
  const [s] = await q("SELECT * FROM shipments WHERE id = $1", [id]);
  if (!s) return null;
  const [items, documents, issues, events, customs, emails, replies, alerts] = await Promise.all([
    q("SELECT * FROM items WHERE shipment_id = $1 ORDER BY position, id", [id]),
    q("SELECT id, kind, filename, mime_type, size_bytes, extracted, confirmed_at, uploaded_at FROM documents WHERE shipment_id = $1 ORDER BY uploaded_at", [id]),
    q("SELECT * FROM issues WHERE shipment_id = $1 ORDER BY status, first_seen_at, id", [id]),
    q("SELECT * FROM events WHERE shipment_id = $1 ORDER BY created_at DESC, id DESC", [id]),
    q("SELECT * FROM customs_messages WHERE shipment_id = $1 ORDER BY created_at DESC", [id]),
    q("SELECT id, kind, to_address, subject, body, provider_id, error, sent_at FROM emails WHERE shipment_id = $1 ORDER BY sent_at DESC", [id]),
    q(`SELECT r.*, d.filename FROM customs_replies r LEFT JOIN documents d ON d.id = r.document_id
        WHERE r.shipment_id = $1 ORDER BY r.created_at DESC`, [id]),
    q("SELECT id, title, severity, lines, actions, channels, resolved_at, created_at FROM alerts WHERE shipment_id = $1 ORDER BY created_at DESC", [id]),
  ]);
  return { shipment: s, items, documents: documents.filter((d) => d.kind !== "supporting"), supporting: documents.filter((d) => d.kind === "supporting"), issues, events, customs, emails, replies, alerts };
}
export type ShipmentBundle = NonNullable<Awaited<ReturnType<typeof getShipment>>>;

/** Booking as the rules see it: stored values, with the original text for anything that didn't parse. */
export function toRawBooking(s: Row, items: Row[]): RawBooking {
  const rawIn = (s.raw_input ?? {}) as Record<string, unknown>;
  const b: RawBooking = { id: s.id };
  for (const c of BOOKING_COLUMNS) {
    let v = c in rawIn ? rawIn[c] : s[c];
    if (c === "appointment_booked" && typeof v === "boolean") v = v ? "Yes" : "No";
    b[c] = v;
  }
  b.items = items.map((it) => {
    const r = (it.raw_input ?? {}) as Record<string, unknown>;
    const out: RawItem = {};
    for (const c of ITEM_COLUMNS) out[c] = c in r ? r[c] : it[c];
    return out;
  });
  return b;
}

function docInfos(documents: Row[]): DocInfo[] {
  // Latest upload of each kind counts.
  const latest = new Map<string, Row>();
  for (const d of documents) latest.set(d.kind, d);
  return [...latest.values()].map((d) => ({ kind: d.kind, extracted: d.extracted, confirmed: !!d.confirmed_at }));
}

// ---------------------------------------------------------------- save

const blank = (v: unknown) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");

/** Display text for a change list, e.g. "3" or "05-11-2026". */
function show(v: unknown): string {
  if (blank(v)) return "blank";
  if (v instanceof Date) return toDisplayDate(v.toISOString().slice(0, 10));
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number") return fmt(v);
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return toDisplayDate(s.slice(0, 10));
  if (/^-?\d+(\.\d+)?$/.test(s)) return fmt(Number(s));
  return s;
}

/** Plain list of what changed between two raw bookings, e.g. "Pallets: 3 → 4". */
export function diffBookings(before: RawBooking, after: RawBooking): string[] {
  const changes: string[] = [];
  for (const c of BOOKING_COLUMNS) {
    const a = show(before[c]), b = show(after[c]);
    if (a !== b) changes.push(`${BOOKING_LABELS[c as keyof typeof BOOKING_LABELS] ?? c}: ${a} → ${b}`);
  }
  const key = (it: RawItem, i: number) => (blank(it.sku) ? `#${i}` : String(it.sku).toLowerCase());
  const beforeItems = new Map((before.items ?? []).map((it, i) => [key(it, i), it]));
  const afterItems = new Map((after.items ?? []).map((it, i) => [key(it, i), it]));
  for (const [k, it] of afterItems) {
    const old = beforeItems.get(k);
    const name = blank(it.sku) ? "New item" : String(it.sku);
    if (!old) { changes.push(`Added item ${name}`); continue; }
    for (const c of ITEM_COLUMNS) {
      // HS codes and SKUs are codes, not amounts: show them exactly as stored.
      const asText = c === "hs_code" || c === "sku";
      const a = asText ? String(old[c] ?? "blank") : show(old[c]), b = asText ? String(it[c] ?? "blank") : show(it[c]);
      if (a !== b) changes.push(`${name} ${ITEM_LABELS[c].toLowerCase()}: ${a} → ${b}`);
    }
  }
  for (const [k, it] of beforeItems) if (!afterItems.has(k)) changes.push(`Removed item ${blank(it.sku) ? k : it.sku}`);
  return changes;
}

/**
 * Save a whole booking (fields + items). Values that parse are stored in their columns; anything
 * that doesn't is kept word for word in raw_input so the seller sees their own text and the error.
 */
export async function storeBooking(id: string, raw: RawBooking) {
  const { booking } = parseBooking(raw);
  const rawInput: Record<string, unknown> = {};
  const cols: Record<string, unknown> = {};
  for (const c of BOOKING_COLUMNS) {
    const parsed = (booking as Record<string, unknown>)[c];
    cols[c] = parsed ?? null;
    if ((parsed === null || parsed === undefined) && !blank(raw[c])) rawInput[c] = raw[c] instanceof Date ? raw[c] : String(raw[c]);
  }
  await q(
    `UPDATE shipments SET ${BOOKING_COLUMNS.map((c, i) => `${c} = $${i + 2}`).join(", ")},
       raw_input = $${BOOKING_COLUMNS.length + 2}, updated_at = now() WHERE id = $1`,
    [id, ...BOOKING_COLUMNS.map((c) => cols[c]), Object.keys(rawInput).length ? JSON.stringify(rawInput) : null],
  );
  await q("DELETE FROM items WHERE shipment_id = $1", [id]);
  const rawItems = raw.items ?? [];
  for (const [i, it] of booking.items.entries()) {
    const src = rawItems[i] ?? {};
    const itemRaw: Record<string, unknown> = {};
    for (const c of ITEM_COLUMNS) {
      if (((it as Record<string, unknown>)[c] ?? null) === null && !blank(src[c])) itemRaw[c] = String(src[c]);
    }
    await q(
      `INSERT INTO items (shipment_id, position, ${ITEM_COLUMNS.join(", ")}, raw_input)
       VALUES ($1, $2, ${ITEM_COLUMNS.map((_, j) => `$${j + 3}`).join(", ")}, $${ITEM_COLUMNS.length + 3})`,
      [id, i + 1, ...ITEM_COLUMNS.map((c) => (it as Record<string, unknown>)[c] ?? null),
       Object.keys(itemRaw).length ? JSON.stringify(itemRaw) : null],
    );
  }
}

export async function createShipment(actor: Actor, raw: RawBooking = {}, sellerEmail: string | null = null) {
  const id = (typeof raw.id === "string" && raw.id.trim()) || (await nextShipmentId());
  await q("INSERT INTO shipments (id, seller_email) VALUES ($1, $2)", [id, sellerEmail]);
  await storeBooking(id, { ...raw, id });
  await logEvent(id, actor, "Booking created");
  return id;
}

/** Booking fields that change what the carrier quoted or the delivery slot: editing them asks again. */
const CARRIER_FIELDS = ["origin_city", "destination_city", "destination_country", "ready_date", "pallets", "cartons", "gross_weight_kg"] as const;

/** Seller edits the booking: save, tell them what changed (timeline), re-run every check. */
export async function updateBooking(id: string, raw: RawBooking, actor: Actor, how = "Edited the booking") {
  const before = await getShipment(id);
  if (!before) throw new Error("Shipment not found");
  if (isLocked(before.shipment)) throw new Error("This shipment has already been declared to customs, so the booking can't be changed.");
  const oldRaw = toRawBooking(before.shipment, before.items);
  await storeBooking(id, raw);
  const after = await getShipment(id);
  const newRaw = toRawBooking(after!.shipment, after!.items);
  const changes = diffBookings(oldRaw, newRaw);
  if (changes.length) {
    await logEvent(id, actor, `${how}: ${changes.join("; ")}`, { changes });
    const s = before.shipment;
    if (s.warehouse_result === "mismatch") {
      await q("UPDATE shipments SET warehouse_result = NULL WHERE id = $1", [id]);
      await logEvent(id, { role: "system" }, "Booking changed after a warehouse mismatch, so the warehouse needs to check again");
    }
    // After submit: if something the carrier quoted on changed, ask the carrier (and later the warehouse) again.
    const carrierChanged = CARRIER_FIELDS.some((f) => diffBookings({ [f]: oldRaw[f] }, { [f]: newRaw[f] }).length > 0);
    if (s.submitted_at && carrierChanged && (s.carrier_status === "requested" || s.carrier_status === "confirmed")) {
      await q(
        `UPDATE shipments SET carrier_status = 'requested', carrier_ref = NULL, carrier_pickup_date = NULL, carrier_pickup_time = NULL,
           carrier_confirmed_at = NULL,
           appointment_status = CASE WHEN appointment_status IN ('requested', 'confirmed') THEN NULL ELSE appointment_status END,
           appointment_booked = CASE WHEN appointment_status = 'confirmed' THEN false ELSE appointment_booked END,
           appointment_ref = NULL, appointment_date = NULL, appointment_time = NULL, appointment_confirmed_at = NULL
         WHERE id = $1`, [id]);
      await logEvent(id, { role: "system" }, `The booking changed after submit, so ${s.selected_carrier} has been asked to confirm the collection again`);
      const fresh = await getShipment(id);
      await sendCarrierRequestEmail(fresh!.shipment, fresh!.items, true);
    }
  }
  const result = await recheck(id, actor);
  return { changes, result };
}

// ---------------------------------------------------------------- check + status

/** `blocking`: the problems that stop the shipment (booking details, rulebook, carrier/warehouse events). Document warnings never do. */
export type FullCheck = CheckResult & { docIssues: Issue[]; allIssues: Issue[]; blocking: Issue[]; readyForCustoms: boolean };

/** Names of the carriers that can take this load, best first for the seller's priority. */
export const rankedCarriers = (check: CheckResult) =>
  check.carrier?.pick ? [check.carrier.pick, ...check.carrier.alternatives] : [];

/** All checks for a shipment. With `raw`, checks that booking instead (to try a fix before saving it). */
export function runAllChecks(bundle: ShipmentBundle, raw?: RawBooking): FullCheck {
  const s = bundle.shipment;
  // R-10 (ready date today or later) is judged on the day the booking was submitted, not every day after.
  const submittedDay = s.submitted_at ? ukToday(new Date(s.submitted_at)) : undefined;
  const result = checkBooking(raw ?? toRawBooking(s, bundle.items), { today: submittedDay });
  const docIssues = checkDocuments(result.booking, docInfos(bundle.documents));
  const extra: Issue[] = [];
  const red = (code: string, key: string, message: string, fix: string, owner: Issue["owner"] = "seller") =>
    extra.push({ code, kind: "RED", severity: "RED", key: `${code}:${key}`, message, fix, owner });

  if (s.warehouse_result === "mismatch") {
    red("WAREHOUSE", "mismatch", `The warehouse found a mismatch: "${s.warehouse_note ?? "no note"}"`,
      "Correct the booking (or talk to the warehouse), then the warehouse checks again.");
  }
  if (s.selected_carrier && result.carrier && !rankedCarriers(result).some((c) => c.name === s.selected_carrier)) {
    const why = result.carrier.removed.find((r) => r.startsWith(s.selected_carrier)) ?? "it can't take this load";
    red("CARRIER", "ineligible", `${s.selected_carrier} can't be used any more: ${why.replace(/^.*removed: /, "")}`, "Choose another carrier.");
  }
  if (s.carrier_status === "declined") {
    red("CARRIER", "declined", `The carrier declined the collection${s.carrier_note ? `: "${s.carrier_note}"` : "."}`,
      "Choose a carrier and send a new collection request.");
  }
  if (s.appointment_status === "declined") {
    red("APPOINTMENT", "declined", `The warehouse declined the delivery slot${s.appointment_note ? `: "${s.appointment_note}"` : "."}`,
      "Send a new delivery slot request.");
  }
  const blocking = [...result.issues, ...extra];
  const allIssues = [...result.issues, ...docIssues, ...extra];
  return { ...result, docIssues, allIssues, blocking, readyForCustoms: !blocking.some((i) => i.severity === "RED") };
}

/** An AMBER item counts as checked when the seller ticked it and the message hasn't changed since. */
export function isAcknowledged(s: Row, issue: Issue) {
  const ack = (s.acknowledged ?? {})[issue.key];
  return !!ack && ack.message === issue.message;
}

/** AMBER rulebook items the seller must fix or tick. Document warnings don't need a tick. */
export const ambersToCheck = (check: FullCheck) =>
  check.blocking.filter((i) => i.severity === "AMBER");

/** `warning`: shown on the submit screen when not done, but doesn't stop Submit. */
export type ReadinessItem = { key: string; label: string; ok: boolean; detail: string; action: string; warning?: boolean };

/** What must be true before the seller can press Submit booking (documents are warnings only). */
export function submitReadiness(bundle: ShipmentBundle, check: FullCheck): { ready: boolean; items: ReadinessItem[] } {
  const s = bundle.shipment;
  const reds = check.blocking.filter((i) => i.severity === "RED");
  const ambers = ambersToCheck(check);
  const ticked = ambers.filter((i) => isAcknowledged(s, i)).length;
  const latest = (k: string) => bundle.documents.filter((d) => d.kind === k).at(-1);
  const docsOk = ["commercial_invoice", "packing_list"].every((k) => latest(k)?.confirmed_at);
  const skus = bundle.items.map((i) => i.sku).filter(Boolean);
  const missing = missingDetails(s.doc_details, skus);
  const carrierOk = !!s.selected_carrier && rankedCarriers(check).some((c) => c.name === s.selected_carrier);
  const items: ReadinessItem[] = [
    { key: "details", label: "Booking details complete", ok: !check.inputBlocked,
      detail: check.inputBlocked ? `${check.issues.filter((i) => i.kind === "ERROR").length} detail(s) missing or not valid` : "All required fields filled in",
      action: "Complete the booking details" },
    { key: "reds", label: "All RED problems fixed", ok: reds.length === 0,
      detail: reds.length ? `${reds.length} RED problem(s) open` : "No RED problems",
      action: reds.length ? `Fix ${reds.length} RED problem${reds.length === 1 ? "" : "s"}: ${reds[0].message}` : "" },
    { key: "ambers", label: "Every AMBER item fixed or checked", ok: ticked === ambers.length,
      detail: ambers.length ? `${ticked} of ${ambers.length} checked` : "No AMBER items", action: "Fix or tick the AMBER items" },
    { key: "carrier", label: "Carrier selected", ok: carrierOk,
      detail: carrierOk ? s.selected_carrier : "Choose a carrier from the recommendations", action: "Choose a carrier" },
    { key: "documents", label: "Commercial invoice and packing list uploaded and confirmed", ok: docsOk && check.docIssues.length === 0, warning: true,
      detail: !docsOk ? "Not all uploaded and confirmed yet. You can still submit; customs will need them."
        : check.docIssues.length ? `${check.docIssues.length} document warning(s). You can still submit.` : "Both confirmed and they match the booking",
      action: "Upload and confirm the invoice and packing list" },
    { key: "docDetails", label: "Document details complete", ok: missing.length === 0, warning: true,
      detail: missing.length ? `${missing.length} detail(s) missing: ${missing.slice(0, 3).map((m) => m.label).join(", ")}${missing.length > 3 ? "…" : ""}. You can still submit.` : "All provided",
      action: "Fill in the missing document details" },
  ];
  return { ready: items.every((i) => i.ok || i.warning), items };
}

function deriveStatus(bundle: ShipmentBundle, check: FullCheck): { status: Status; pending: string | null; responsible: string | null } {
  const s = bundle.shipment;
  const reds = check.blocking.filter((i) => i.severity === "RED");
  if (s.status === "Delivered") return { status: "Delivered", pending: null, responsible: null };
  if (s.customs_status) {
    if (s.customs_status === "Cleared") return { status: "Cleared", pending: "Mark as delivered when it arrives", responsible: "forwarder" };
    if (s.customs_reply_at) {
      return { status: s.customs_status, pending: "Send the seller's reply to customs and resubmit the declaration", responsible: "forwarder" };
    }
    return {
      status: s.customs_status,
      pending: `Customs asks: ${s.customs_next_steps ?? "see the reason from customs"}`,
      responsible: s.customs_responsible ?? "seller",
    };
  }
  if (s.declaration_ref) return { status: "Declaration submitted", pending: "Wait for customs, then paste their email here", responsible: "forwarder" };
  if (!s.submitted_at) {
    const first = submitReadiness(bundle, check).items.find((i) => !i.ok && !i.warning);
    return { status: "Draft", pending: first ? first.action : "Submit the booking", responsible: "seller" };
  }
  if (s.warehouse_result === "mismatch") return { status: "Mismatch", pending: "Fix the mismatch the warehouse found", responsible: "seller" };
  if (reds.length) {
    return { status: "Action required", pending: `Fix ${reds.length} problem${reds.length === 1 ? "" : "s"}: ${reds[0].fix}`, responsible: reds[0].owner };
  }
  const waiting: { text: string; who: string }[] = [];
  if (s.carrier_status === "requested") waiting.push({ text: `${s.selected_carrier} to confirm the collection`, who: "carrier" });
  if (s.appointment_status === "requested") waiting.push({ text: "warehouse to confirm the delivery slot", who: "warehouse" });
  if (s.appointment_status === "proposed") waiting.push({ text: "seller to accept the slot the warehouse proposed", who: "seller" });
  if (s.warehouse_result !== "accepted") waiting.push({ text: "warehouse to check the goods against the booking", who: "warehouse" });
  if (!waiting.length) return { status: "Ready for customs", pending: "Submit the customs declaration", responsible: "forwarder" };
  return {
    status: s.warehouse_result === "accepted" ? "Warehouse accepted" : "Docs submitted",
    pending: `Waiting for: ${waiting.map((w) => w.text).join("; ")}`,
    responsible: waiting[0].who,
  };
}

/**
 * Re-run every check, sync the open problems, update status, and email the seller about new problems.
 * Called after every change (seller edit, upload, warehouse decision…).
 */
export async function recheck(id: string, actor: Actor = { role: "system" }, opts: { email?: boolean } = {}) {
  const bundle = await getShipment(id);
  if (!bundle) throw new Error("Shipment not found");
  const check = runAllChecks(bundle);
  const s = bundle.shipment;

  // Sync issues: keep first_seen_at for problems that are still there, resolve the ones that are gone.
  const open = bundle.issues.filter((i) => i.status === "open");
  const openKeys = new Map(open.map((i) => [i.field_key, i]));
  const nowKeys = new Set(check.allIssues.map((i) => i.key));
  const added: Issue[] = [];
  for (const i of check.allIssues) {
    const existing = openKeys.get(i.key);
    if (existing) {
      if (existing.message !== i.message || existing.fix !== i.fix || existing.severity !== i.severity) {
        await q("UPDATE issues SET message = $2, fix = $3, severity = $4, owner_role = $5 WHERE id = $1",
          [existing.id, i.message, i.fix, i.severity, i.owner]);
      }
      continue;
    }
    added.push(i);
    await q(
      `INSERT INTO issues (shipment_id, code, severity, field_key, message, fix, owner_role) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [id, i.code, i.severity, i.key, i.message, i.fix, i.owner],
    );
  }
  const resolved = open.filter((i) => !nowKeys.has(i.field_key));
  for (const i of resolved) await q("UPDATE issues SET status = 'resolved', resolved_at = now() WHERE id = $1", [i.id]);

  const { status, pending, responsible } = deriveStatus(bundle, check);
  const snapshot = {
    overall: check.overall, headline: check.headline, readyForCustoms: check.readyForCustoms, inputBlocked: check.inputBlocked,
    carrier: check.carrier?.pick ? { name: check.carrier.pick.name, price: check.carrier.pick.price, days: check.carrier.pick.transitDays } : null,
    reds: check.allIssues.filter((i) => i.severity === "RED").length,
    ambers: check.allIssues.filter((i) => i.severity === "AMBER").length,
  };
  await q(
    "UPDATE shipments SET status = $2, pending_action = $3, responsible_role = $4, last_check = $5 WHERE id = $1",
    [id, status, pending, responsible, JSON.stringify(snapshot)],
  );

  const sys: Actor = { role: "system" };
  // While a draft is being filled in, the problem list changes with every message: only log once submitted.
  const quiet = s.status === "Draft" && status === "Draft";
  if (added.length && !quiet) {
    await logEvent(id, sys, `Checks found ${added.length} new problem${added.length === 1 ? "" : "s"}: ${added.map((i) => `${i.code} ${i.message}`).join(" | ")}`);
  }
  if (resolved.length && !quiet) {
    await logEvent(id, sys, `${resolved.length} problem${resolved.length === 1 ? "" : "s"} fixed: ${resolved.map((i) => `${i.code} ${i.message}`).join(" | ")}`);
  }
  if (status !== s.status) await logEvent(id, sys, `Status changed from ${s.status} to ${status}`);
  if (!check.allIssues.length) await resolveAlerts(id, "problems");

  // Problem alert to the seller when new problems appear after submit. Drafts (the seller is on screen)
  // get the 24-hour reminder instead, once the booking details are complete.
  // "Please confirm the fields you just uploaded" is a step on screen, not something to email about.
  // Declines already have their own email to the seller.
  // (Declines and a warehouse rejection have their own alert, with the reason and next steps.)
  const alertable = (list: Issue[]) => list.filter((i) => !i.key.endsWith(":confirm") && !i.key.endsWith(":declined") && !i.key.startsWith("WAREHOUSE:"));
  if (opts.email !== false && status !== "Draft" && alertable(added).length) {
    const fresh = await getShipment(id);
    await sendIssuesEmail(fresh!, "issues");
  }
  void actor;
  return check;
}

// ---------------------------------------------------------------- list

export async function listShipments(status?: string) {
  const params: unknown[] = [];
  let where = "";
  if (status) { params.push(status); where = "WHERE s.status = $1"; }
  return q(
    `SELECT s.id, s.seller_name, s.origin_city, s.destination_city, s.destination_country, s.destination_type, s.status,
            s.pending_action, s.responsible_role, s.updated_at, s.last_check, s.submitted_at, s.declaration_ref, s.customs_reply_at,
            s.carrier_status, s.appointment_status,
            -- A chat booking the seller left before confirming it: it reopens in New booking to carry on.
            (s.status = 'Draft' AND s.submitted_at IS NULL AND COALESCE((s.chat_state->>'confirmed')::boolean, false) = false
              AND EXISTS (SELECT 1 FROM chat_messages c WHERE c.shipment_id = s.id)) AS resume_chat,
            (SELECT count(*)::int FROM issues i WHERE i.shipment_id = s.id AND i.status = 'open' AND i.severity = 'RED') AS reds,
            (SELECT count(*)::int FROM issues i WHERE i.shipment_id = s.id AND i.status = 'open' AND i.severity = 'AMBER') AS ambers
       FROM shipments s ${where} ORDER BY s.updated_at DESC`,
    params,
  );
}
