// Data for the role dashboards (warehouse, forwarder, carrier). Read-only queries.
import { q, type Row } from "./db";
import { CARRIERS } from "./rules/constants";

const transitDays = (carrier: string | null) => CARRIERS.find((c) => c.name === carrier)?.transitDays ?? 0;

const iso = (d: unknown) => (d instanceof Date ? d.toISOString().slice(0, 10) : d ? String(d).slice(0, 10) : null);

/** Expected arrival = confirmed (or requested) collection + the carrier's transit days. */
export function expectedArrival(s: Row): string | null {
  const from = iso(s.carrier_pickup_date) ?? iso(s.collection_date);
  if (!from) return null;
  const d = new Date(`${from}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + transitDays(s.selected_carrier));
  return d.toISOString().slice(0, 10);
}

const SHIPMENT_COLS = `s.id, s.seller_name, s.seller_email, s.origin_city, s.destination_city, s.destination_country, s.destination_type,
  s.status, s.pending_action, s.responsible_role, s.updated_at, s.submitted_at, s.ready_date, s.pallets, s.cartons, s.gross_weight_kg,
  s.declared_value, s.selected_carrier, s.collection_date, s.collection_window, s.carrier_status, s.carrier_ref, s.carrier_pickup_date,
  s.carrier_pickup_time, s.carrier_note, s.appointment_status, s.appointment_date, s.appointment_time, s.appointment_ref, s.appointment_note,
  s.appointment_confirmed_at, s.warehouse_result, s.warehouse_note, s.goods_received_at, s.declaration_ref, s.declaration_date,
  s.customs_status, s.customs_reason, s.customs_next_steps, s.customs_responsible, s.customs_reply_at, s.appointment_booked,
  (SELECT string_agg(i.sku || ' × ' || i.quantity, ', ' ORDER BY i.position) FROM items i WHERE i.shipment_id = s.id) AS goods,
  (SELECT count(*)::int FROM issues x WHERE x.shipment_id = s.id AND x.status = 'open' AND x.severity = 'RED') AS reds`;

const withArrival = (rows: Row[]): Row[] => rows.map((r) => ({ ...r, expected_arrival: expectedArrival(r) }));

/** Last email to the seller for each shipment (so the warehouse sees the seller was told). */
async function lastSellerEmail(ids: string[]) {
  if (!ids.length) return new Map<string, Row>();
  const rows = await q(
    `SELECT DISTINCT ON (shipment_id) shipment_id, subject, sent_at, provider_id
       FROM emails WHERE shipment_id = ANY($1) AND kind IN ('goods_result', 'appointment_confirmed', 'appointment_declined', 'appointment_proposed', 'issues')
      ORDER BY shipment_id, sent_at DESC`, [ids]);
  return new Map(rows.map((r) => [r.shipment_id, r]));
}

export async function warehouseDashboard() {
  const scheduled = withArrival(await q(
    `SELECT ${SHIPMENT_COLS} FROM shipments s
      WHERE s.destination_type = 'Warehouse' AND s.appointment_status IN ('confirmed', 'seller_booked') AND s.declaration_ref IS NULL
        AND s.status NOT IN ('Delivered')
      ORDER BY s.appointment_date NULLS LAST, s.appointment_time`));
  const pending = withArrival(await q(
    `SELECT ${SHIPMENT_COLS},
            (SELECT max(e.created_at) FROM events e WHERE e.shipment_id = s.id AND e.action LIKE '%delivery slot%') AS requested_at
       FROM shipments s WHERE s.appointment_status IN ('requested', 'proposed')
      ORDER BY (s.appointment_status = 'proposed'), s.carrier_pickup_date NULLS LAST`));
  const history = withArrival(await q(
    `SELECT ${SHIPMENT_COLS} FROM shipments s
      WHERE s.destination_type = 'Warehouse' AND (s.appointment_status IS NOT NULL OR s.warehouse_result IS NOT NULL)
      ORDER BY s.updated_at DESC`));
  const told = await lastSellerEmail(history.map((h) => h.id));
  return { scheduled, pending, history: history.map((h) => ({ ...h, seller_told: told.get(h.id) ?? null })) };
}

export async function forwarderDashboard() {
  const [ready, awaiting, exceptions, done, coming, toConfirm] = await Promise.all([
    q(`SELECT ${SHIPMENT_COLS} FROM shipments s WHERE s.status = 'Ready for customs' ORDER BY s.updated_at`),
    q(`SELECT ${SHIPMENT_COLS},
              (SELECT count(*)::int FROM customs_messages m WHERE m.shipment_id = s.id AND m.confirmed_at IS NULL AND m.dismissed_at IS NULL) AS unconfirmed
         FROM shipments s WHERE s.status = 'Declaration submitted' ORDER BY s.declaration_date`),
    q(`SELECT ${SHIPMENT_COLS},
              (SELECT r.message FROM customs_replies r WHERE r.shipment_id = s.id ORDER BY r.created_at DESC LIMIT 1) AS last_reply,
              (SELECT max(m.confirmed_at) FROM customs_messages m WHERE m.shipment_id = s.id AND m.confirmed_status IN ('On hold', 'Rejected')) AS hold_since
         FROM shipments s WHERE s.status IN ('On hold', 'Rejected') ORDER BY s.customs_reply_at DESC NULLS LAST, s.updated_at`),
    q(`SELECT ${SHIPMENT_COLS} FROM shipments s WHERE s.status IN ('Cleared', 'Delivered') ORDER BY s.status, s.updated_at DESC`),
    q(`SELECT ${SHIPMENT_COLS} FROM shipments s
        WHERE s.submitted_at IS NOT NULL AND s.declaration_ref IS NULL AND s.status NOT IN ('Ready for customs')
        ORDER BY s.updated_at DESC`),
    q(`SELECT m.id, m.shipment_id, m.suggested_status, m.suggested_reason, m.created_at, s.seller_name
         FROM customs_messages m JOIN shipments s ON s.id = m.shipment_id
        WHERE m.confirmed_at IS NULL AND m.dismissed_at IS NULL ORDER BY m.created_at`),
  ]);
  return { ready, awaiting, exceptions, done, coming: withArrival(coming), toConfirm };
}

export async function carrierDashboard() {
  const [requests, scheduled, history] = await Promise.all([
    q(`SELECT ${SHIPMENT_COLS} FROM shipments s WHERE s.carrier_status = 'requested' ORDER BY s.collection_date`),
    q(`SELECT ${SHIPMENT_COLS} FROM shipments s WHERE s.carrier_status = 'confirmed' AND s.status NOT IN ('Delivered', 'Cleared')
         ORDER BY s.carrier_pickup_date, s.carrier_pickup_time`),
    q(`SELECT ${SHIPMENT_COLS} FROM shipments s WHERE s.carrier_status IS NOT NULL ORDER BY s.updated_at DESC`),
  ]);
  return { requests: withArrival(requests), scheduled: withArrival(scheduled), history: withArrival(history) };
}

/**
 * Bookings waiting on the seller (the hero's "Need you now" count): what to do, the main problem,
 * how long it has been waiting, and the numbers behind it. Most urgent first.
 */
export async function sellerTasks() {
  const rows = await q(
    `SELECT ${SHIPMENT_COLS},
            (SELECT count(*)::int FROM issues x WHERE x.shipment_id = s.id AND x.status = 'open' AND x.severity = 'AMBER') AS ambers,
            (SELECT x.message FROM issues x WHERE x.shipment_id = s.id AND x.status = 'open'
               ORDER BY (x.severity = 'RED') DESC, x.first_seen_at LIMIT 1) AS top_issue,
            (SELECT x.fix FROM issues x WHERE x.shipment_id = s.id AND x.status = 'open'
               ORDER BY (x.severity = 'RED') DESC, x.first_seen_at LIMIT 1) AS top_fix,
            (SELECT count(*)::int FROM alerts a WHERE a.shipment_id = s.id AND a.resolved_at IS NULL
               AND a.actions IS NOT NULL AND a.severity IN ('warning', 'error')) AS open_alerts,
            COALESCE(
              CASE WHEN s.customs_status IN ('On hold', 'Rejected')
                THEN (SELECT max(m.confirmed_at) FROM customs_messages m WHERE m.shipment_id = s.id AND m.confirmed_status = s.customs_status) END,
              (SELECT min(x.first_seen_at) FROM issues x WHERE x.shipment_id = s.id AND x.status = 'open' AND x.severity = 'RED'),
              (SELECT max(a.created_at) FROM alerts a WHERE a.shipment_id = s.id AND a.resolved_at IS NULL AND a.actions IS NOT NULL),
              s.updated_at
            ) AS waiting_since
       FROM shipments s
      WHERE s.responsible_role = 'seller' AND s.status <> 'Draft'
      ORDER BY (SELECT count(*) FROM issues x WHERE x.shipment_id = s.id AND x.status = 'open' AND x.severity = 'RED') DESC, waiting_since`,
  );
  return rows;
}
