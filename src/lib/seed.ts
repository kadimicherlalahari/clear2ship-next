// Sample shipments covering every stage, for every role's dashboard. Dates are relative to today.
// Wipes and reloads only these IDs. Rules-clean numbers (quantities, values, cartons, weights) are
// computed from the items, so the only problems are the ones each sample is meant to show.
import { q } from "./db";
import { CARRIERS } from "./rules/constants";
import { recheck } from "./shipments";

type ItemIn = { sku: string; desc: string; hs: string; upc: number; cartons: number; price: number; kg: number; origin: string };
type Stage =
  | "draft_missing_pl" | "carrier_requested" | "carrier_declined" | "slot_requested" | "slot_proposed" | "slot_confirmed"
  | "received" | "mismatch" | "declared" | "email_pending" | "on_hold" | "on_hold_replied" | "rejected" | "cleared" | "delivered";
type Sample = {
  id: string; seller: string; origin: string; city: string; country: string; type: "Warehouse" | "Business address";
  priority: "Cheapest" | "Fastest" | "Most reliable" | "Balanced"; carrier: string; items: ItemIn[]; stage: Stage;
  submit: number; pickup?: number; slot?: number; slotTime?: string; decl?: number; apptBooked?: boolean;
  customs?: { email: string; reason: string; next: string }; reply?: string; mismatch?: string; proposalNote?: string;
};

const DAY = 864e5;
const isoDay = (offset: number) => new Date(Date.now() + offset * DAY).toISOString().slice(0, 10);
const dmy = (iso: string) => iso.split("-").reverse().join("-");
const ago = (days: number, hours = 0) => new Date(Date.now() - (days * 24 + hours) * 36e5).toISOString();

const SELLERS: Record<string, { address: string; eori: string; email: string }> = {
  "Northfield Goods": { address: "12 Mill Lane, Manchester M4 6AB, United Kingdom", eori: "GB123456789000", email: "orders@northfield.example.test" },
  "Loom & Thread": { address: "4 Wharf Street, Leeds LS2 7EQ, United Kingdom", eori: "GB987654321000", email: "hello@loomthread.example.test" },
  "Harbour Home": { address: "7 Dock Road, London E16 1AA, United Kingdom", eori: "GB555666777000", email: "ops@harbourhome.example.test" },
  "Alpine Outdoor": { address: "21 Digbeth High St, Birmingham B5 6DY, United Kingdom", eori: "GB246813579000", email: "export@alpine.example.test" },
  "Brightside Toys": { address: "88 Kirkgate, Leeds LS1 6BY, United Kingdom", eori: "GB135792468000", email: "team@brightside.example.test" },
  "Kettle & Co": { address: "3 Shoreditch Yard, London E2 7DJ, United Kingdom", eori: "GB112233445000", email: "sales@kettleco.example.test" },
  "Oak & Ash": { address: "16 Cross York St, Leeds LS2 7EE, United Kingdom", eori: "GB998877665000", email: "studio@oakash.example.test" },
  "Peak Fitness": { address: "40 Broad Street, Birmingham B1 2HF, United Kingdom", eori: "GB443322110000", email: "ship@peakfit.example.test" },
};
const BUYERS: Record<string, { name: string; address: string }> = {
  Frankfurt: { name: "Rhein Retail GmbH (Fulfilment FRA1)", address: "Hanauer Landstraße 100, 60314 Frankfurt, Germany" },
  Hamburg: { name: "Nordlager Logistik GmbH", address: "Am Sandtorkai 50, 20457 Hamburg, Germany" },
  Berlin: { name: "Spree Fulfilment GmbH", address: "Ostbahnhofstraße 5, 10243 Berlin, Germany" },
  Rotterdam: { name: "Huis & Haard BV", address: "Waalhaven 12, 3089 Rotterdam, Netherlands" },
  Amsterdam: { name: "Grachten Distributie BV", address: "Westpoortweg 70, 1047 Amsterdam, Netherlands" },
  Paris: { name: "Maison Coton SARL", address: "18 Rue du Faubourg, 75010 Paris, France" },
  Lyon: { name: "Atelier Sonore SARL", address: "22 Quai Saint-Antoine, 69002 Lyon, France" },
};

const it = (sku: string, desc: string, hs: string, upc: number, cartons: number, price: number, kg: number, origin = "United Kingdom"): ItemIn =>
  ({ sku, desc, hs, upc, cartons, price, kg, origin });

const SAMPLES: Sample[] = [
  { id: "BK-001", seller: "Northfield Goods", origin: "Manchester", city: "Frankfurt", country: "Germany", type: "Warehouse", priority: "Cheapest", carrier: "Carrier A",
    items: [it("MUG-01", "Ceramic coffee mug, 350 ml", "691200", 12, 90, 5, 0.5)], stage: "received", submit: -6, pickup: -4, slot: -1, slotTime: "10:00" },
  { id: "BK-002", seller: "Loom & Thread", origin: "Leeds", city: "Paris", country: "France", type: "Business address", priority: "Balanced", carrier: "Carrier B",
    items: [it("TSH-01", "Cotton t-shirt, crew neck", "610910", 50, 12, 8, 0.2, "India")], stage: "draft_missing_pl", submit: 0 },
  { id: "BK-003", seller: "Harbour Home", origin: "London", city: "Rotterdam", country: "Netherlands", type: "Warehouse", priority: "Most reliable", carrier: "Carrier C",
    items: [it("TIL-01", "Ceramic floor tiles, box of 10", "690721", 20, 20, 12, 2, "Turkey"), it("VAS-02", "Glass flower vase", "701399", 12, 10, 15, 1.5, "China")],
    stage: "on_hold", submit: -10, pickup: -8, slot: -6, slotTime: "08:30", decl: -4,
    customs: {
      email: "From: clearance@example-forwarder.test\nSubject: BK-003 – goods held\n\nHello,\nThe Dutch customs office has placed this consignment on hold. Reason: Proof of origin missing for line 2 (glass vases, China). Please provide the supplier's declaration of origin within 5 working days.\nRegards, Clearance team",
      reason: "Proof of origin missing for line 2 (glass vases, China). Please provide the supplier's declaration of origin within 5 working days.",
      next: "Send the supplier's declaration of origin for the glass vases (VAS-02) within 5 working days." } },
  { id: "BK-101", seller: "Alpine Outdoor", origin: "Birmingham", city: "Hamburg", country: "Germany", type: "Warehouse", priority: "Balanced", carrier: "Carrier B",
    items: [it("BTL-01", "Insulated steel water flask, 750 ml", "961700", 24, 30, 9, 0.45, "China"), it("TRK-02", "Aluminium trekking pole", "950699", 10, 12, 18, 0.3, "Vietnam")],
    stage: "slot_confirmed", submit: -4, pickup: -3, slot: 0, slotTime: "14:00" },
  { id: "BK-102", seller: "Brightside Toys", origin: "Leeds", city: "Amsterdam", country: "Netherlands", type: "Warehouse", priority: "Cheapest", carrier: "Carrier A",
    items: [it("TOY-11", "Wooden stacking rings toy", "950300", 20, 25, 6, 0.35)], stage: "slot_confirmed", submit: -3, pickup: -2, slot: 3, slotTime: "09:00" },
  { id: "BK-103", seller: "Kettle & Co", origin: "London", city: "Berlin", country: "Germany", type: "Warehouse", priority: "Fastest", carrier: "Carrier C",
    items: [it("KTL-05", "Stainless steel stovetop kettle, 2 l", "732393", 6, 30, 22, 1.1, "China")], stage: "slot_requested", submit: -2, pickup: 1 },
  { id: "BK-104", seller: "Northfield Goods", origin: "Manchester", city: "Frankfurt", country: "Germany", type: "Warehouse", priority: "Cheapest", carrier: "Carrier A",
    items: [it("PLT-03", "Stoneware dinner plate, 27 cm", "691200", 12, 40, 7, 0.7)], stage: "slot_requested", submit: -1, pickup: 2 },
  { id: "BK-105", seller: "Peak Fitness", origin: "Birmingham", city: "Rotterdam", country: "Netherlands", type: "Warehouse", priority: "Balanced", carrier: "Carrier B",
    items: [it("MAT-07", "Natural rubber yoga mat, 4 mm", "401699", 10, 20, 19, 1.8, "India")], stage: "slot_proposed", submit: -3, pickup: 1, slot: 5, slotTime: "13:00",
    proposalNote: "Fully booked on the requested day. Earliest free slot offered." },
  { id: "BK-106", seller: "Oak & Ash", origin: "Leeds", city: "Hamburg", country: "Germany", type: "Warehouse", priority: "Most reliable", carrier: "Carrier B",
    items: [it("BRD-02", "Oak chopping board, 40 cm", "441990", 8, 30, 14, 1.2)], stage: "mismatch", submit: -5, pickup: -4, slot: -1, slotTime: "11:00",
    mismatch: "Only 25 of 30 cartons delivered. 5 cartons missing." },
  { id: "BK-107", seller: "Northfield Goods", origin: "Manchester", city: "Berlin", country: "Germany", type: "Warehouse", priority: "Cheapest", carrier: "Carrier A",
    items: [it("BWL-04", "Ceramic salad bowl, 25 cm", "691200", 8, 30, 11, 0.9)], stage: "declared", submit: -7, pickup: -5, slot: -3, slotTime: "09:30", decl: -2 },
  { id: "BK-108", seller: "Brightside Toys", origin: "Leeds", city: "Amsterdam", country: "Netherlands", type: "Warehouse", priority: "Cheapest", carrier: "Carrier A",
    items: [it("PZL-20", "Wooden jigsaw puzzle, 100 pieces", "950590", 16, 20, 8, 0.4)], stage: "email_pending", submit: -9, pickup: -7, slot: -6, slotTime: "10:30", decl: -5,
    customs: { email: "From: douane-desk@example-broker.test\nSubject: PZL-20 consignment\n\nGood afternoon,\nDeclaration for the Brightside Toys puzzles has been accepted and the goods are released by customs. No further action needed.\nKind regards", reason: "", next: "" } },
  { id: "BK-109", seller: "Harbour Home", origin: "London", city: "Frankfurt", country: "Germany", type: "Warehouse", priority: "Balanced", carrier: "Carrier B",
    items: [it("BWL-03", "Stoneware serving bowl, 30 cm", "691200", 6, 30, 16, 1.6)], stage: "rejected", submit: -9, pickup: -7, slot: -5, slotTime: "08:00", decl: -3,
    customs: {
      email: "From: customs-desk@example-broker.test\nSubject: REJECTED – declaration for Harbour Home\n\nDear partner,\nThe declaration has been rejected by German customs. Reason: Commodity code 691200 declared for item BWL-03 does not match the goods description on the commercial invoice. Please correct the commodity code and resubmit with a corrected invoice.\nBroker desk",
      reason: "Commodity code 691200 declared for item BWL-03 does not match the goods description on the commercial invoice. Please correct the commodity code and resubmit with a corrected invoice.",
      next: "Correct the commodity (HS) code for BWL-03 and send a corrected commercial invoice." } },
  { id: "BK-110", seller: "Alpine Outdoor", origin: "Birmingham", city: "Hamburg", country: "Germany", type: "Warehouse", priority: "Balanced", carrier: "Carrier B",
    items: [it("BTL-02", "Insulated steel bottle, 500 ml", "961700", 24, 20, 8, 0.4, "China")], stage: "on_hold_replied", submit: -10, pickup: -8, slot: -6, slotTime: "15:00", decl: -4,
    customs: {
      email: "From: clearance@example-forwarder.test\nSubject: Hold – additional information\n\nHi,\nCustoms have put the bottles on hold. Reason: Please provide the material composition and the intended end use for item BTL-02. Once received we can resubmit.\nThanks",
      reason: "Please provide the material composition and the intended end use for item BTL-02.",
      next: "Send the material composition and intended end use for BTL-02." },
    reply: "BTL-02 is 18/8 stainless steel with a polypropylene lid, for household use (drinks bottle). Spec sheet sent by email to the forwarder." },
  { id: "BK-111", seller: "Kettle & Co", origin: "London", city: "Berlin", country: "Germany", type: "Warehouse", priority: "Fastest", carrier: "Carrier C",
    items: [it("TEA-09", "Cast iron teapot, 1 l", "732393", 6, 20, 25, 1.4, "China")], stage: "cleared", submit: -12, pickup: -10, slot: -9, slotTime: "10:00", decl: -7 },
  { id: "BK-112", seller: "Loom & Thread", origin: "Leeds", city: "Lyon", country: "France", type: "Business address", priority: "Cheapest", carrier: "Carrier A",
    items: [it("SCF-02", "Wool scarf, 180 cm", "611710", 40, 10, 12, 0.15)], stage: "delivered", submit: -15, pickup: -13, decl: -12 },
  { id: "BK-113", seller: "Peak Fitness", origin: "Birmingham", city: "Amsterdam", country: "Netherlands", type: "Warehouse", priority: "Cheapest", carrier: "Carrier A",
    items: [it("DMB-05", "Cast iron dumbbell, 5 kg", "950691", 4, 30, 15, 5, "China")], stage: "carrier_requested", submit: 0, pickup: 3 },
  { id: "BK-114", seller: "Oak & Ash", origin: "Leeds", city: "Paris", country: "France", type: "Business address", priority: "Fastest", carrier: "Carrier C",
    items: [it("STL-01", "Oak bar stool", "940161", 1, 12, 65, 6.5)], stage: "carrier_declined", submit: -1, pickup: 2 },
];

// Order of stages, to decide which steps have happened.
const ORDER: Stage[] = ["draft_missing_pl", "carrier_requested", "carrier_declined", "slot_requested", "slot_proposed", "slot_confirmed",
  "received", "mismatch", "declared", "email_pending", "on_hold", "on_hold_replied", "rejected", "cleared", "delivered"];
const reached = (s: Sample, st: Stage) => {
  const pos = (x: Stage) => ORDER.indexOf(x);
  if (st === "received" && s.stage === "mismatch") return false;
  if (["slot_requested", "slot_proposed", "slot_confirmed", "received"].includes(st) && s.type !== "Warehouse") return pos(s.stage) >= pos("received") && st === "received";
  if (st === "carrier_declined") return s.stage === "carrier_declined";
  if (st === "slot_proposed") return s.stage === "slot_proposed";
  if (["on_hold", "on_hold_replied", "rejected", "email_pending"].includes(st)) return s.stage === st;
  return pos(s.stage) >= pos(st);
};

export const SAMPLE_IDS = SAMPLES.map((s) => s.id);

export async function seedSamples() {
  await q("DELETE FROM shipments WHERE id = ANY($1)", [SAMPLE_IDS]);

  for (const s of SAMPLES) {
    const items = s.items.map((i) => ({ ...i, qty: i.upc * i.cartons }));
    const cartons = items.reduce((t, i) => t + i.cartons, 0);
    const value = items.reduce((t, i) => t + i.qty * i.price, 0);
    const goodsKg = items.reduce((t, i) => t + i.qty * i.kg, 0);
    const gross = Math.ceil(goodsKg * 1.12 + 25);
    const pallets = Math.max(1, Math.ceil(gross / 380));
    const carrier = CARRIERS.find((c) => c.name === s.carrier)!;
    const ready = isoDay(Math.min(s.submit + 1, (s.pickup ?? s.submit + 1)));
    const submitted = s.stage !== "draft_missing_pl";
    const seller = SELLERS[s.seller];
    const buyer = BUYERS[s.city];
    const pickupIso = s.pickup !== undefined ? isoDay(s.pickup) : null;

    // Where things stand
    const carrierStatus = !submitted ? null : s.stage === "carrier_requested" ? "requested" : s.stage === "carrier_declined" ? "declined" : "confirmed";
    let appointment: string | null = s.type === "Warehouse" ? null : "not_needed";
    if (s.type === "Warehouse" && carrierStatus === "confirmed") {
      appointment = s.stage === "slot_requested" ? "requested" : s.stage === "slot_proposed" ? "proposed" : "confirmed";
    }
    const goodsDone = reached(s, "received") || s.stage === "mismatch";
    const declared = s.decl !== undefined && ORDER.indexOf(s.stage) >= ORDER.indexOf("declared");
    const customsStatus = s.stage === "on_hold" || s.stage === "on_hold_replied" ? "On hold" : s.stage === "rejected" ? "Rejected"
      : s.stage === "cleared" || s.stage === "delivered" ? "Cleared" : null;

    await q(
      `INSERT INTO shipments (id, seller_name, seller_email, origin_city, destination_city, destination_country, destination_type,
         ready_date, seller_priority, pallets, cartons, declared_value, gross_weight_kg, appointment_booked, selected_carrier,
         submitted_at, collection_date, collection_window, carrier_status, carrier_ref, carrier_pickup_date, carrier_pickup_time, carrier_note,
         carrier_confirmed_at, appointment_status, appointment_date, appointment_time, appointment_ref, appointment_note, appointment_confirmed_at,
         warehouse_result, warehouse_note, goods_received_at, declaration_ref, declaration_date, customs_status, customs_reason,
         customs_next_steps, customs_responsible, customs_reply_at, status, doc_details, created_at, updated_at, acknowledged)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,
               $31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,$42,$43,$44,$45)`,
      [
        s.id, s.seller, process.env.SAMPLE_SELLER_EMAIL || seller.email, s.origin, s.city, s.country, s.type,
        ready, s.priority, pallets, cartons, value, gross,
        s.type === "Warehouse" ? appointment === "confirmed" : null,
        s.stage === "carrier_declined" ? null : s.carrier,
        submitted ? ago(-s.submit, 2) : null, pickupIso, submitted ? "08:00–12:00" : null,
        carrierStatus, carrierStatus === "confirmed" ? `${s.carrier.slice(-1)}${s.carrier.slice(-1)}-${70000 + Number(s.id.slice(3))}` : null,
        carrierStatus === "confirmed" ? pickupIso : null, carrierStatus === "confirmed" ? "09:30" : null,
        s.stage === "carrier_declined" ? `${s.carrier}: No express capacity on the requested day` : null,
        carrierStatus === "confirmed" ? ago(-s.submit, -6) : null,
        appointment, appointment === "confirmed" || appointment === "proposed" ? isoDay(s.slot!) : null,
        appointment === "confirmed" || appointment === "proposed" ? s.slotTime : null,
        appointment === "confirmed" || appointment === "proposed" ? `${s.city.slice(0, 3).toUpperCase()}-SLOT-${4000 + Number(s.id.slice(3))}` : null,
        appointment === "proposed" ? s.proposalNote ?? null : null,
        appointment === "confirmed" ? ago(-(s.pickup ?? 0), 2) : null,
        goodsDone ? (s.stage === "mismatch" ? "mismatch" : "accepted") : null, s.stage === "mismatch" ? s.mismatch : null,
        goodsDone ? ago(-(s.slot ?? s.pickup ?? 0), -3) : null,
        declared ? `DEC-${({ Germany: "DE", France: "FR", Netherlands: "NL" } as Record<string, string>)[s.country]}-${458800 + Number(s.id.slice(3))}` : null, declared ? isoDay(s.decl!) : null,
        customsStatus, customsStatus && customsStatus !== "Cleared" ? s.customs!.reason : null,
        customsStatus && customsStatus !== "Cleared" ? s.customs!.next : null, customsStatus && customsStatus !== "Cleared" ? "seller" : null,
        s.stage === "on_hold_replied" ? ago(1) : null,
        s.stage === "delivered" ? "Delivered" : "Draft",
        JSON.stringify(docDetails(s, seller, buyer, s.stage === "draft_missing_pl")),
        ago(-s.submit + 1), ago(0, 2),
        // The seller ticked R-08 before submitting (the slot is requested through Clear2Ship).
        submitted && s.type === "Warehouse" && appointment !== "confirmed"
          ? JSON.stringify({ "R-08:appointment": { message: "No delivery slot booked; the warehouse may refuse the truck.", by: "seller", at: ago(-s.submit, 3) } })
          : null,
      ],
    );

    for (const [pos, i] of items.entries()) {
      await q(
        `INSERT INTO items (shipment_id, position, sku, description, hs_code, quantity, unit_price, units_per_carton, cartons, unit_weight_kg, country_of_origin)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [s.id, pos + 1, i.sku, i.desc, i.hs, i.qty, i.price, i.upc, i.cartons, i.kg, i.origin],
      );
    }

    const kinds = s.stage === "draft_missing_pl" ? ["commercial_invoice"] : ["commercial_invoice", "packing_list"];
    const qty = items.reduce((t, i) => t + i.qty, 0);
    for (const kind of kinds) {
      const f = (value: unknown, source: string) => ({ value, source });
      const extracted = kind === "commercial_invoice"
        ? { total_value: f(value, `Total: GBP ${value.toLocaleString("en-GB")}`), currency: f("GBP", "GBP"), total_quantity: f(qty, `${qty} units`) }
        : { total_cartons: f(cartons, `${cartons} cartons`), gross_weight_kg: f(gross, `Gross weight ${gross} kg`), total_quantity: f(qty, `${qty} pcs`) };
      await q(
        `INSERT INTO documents (shipment_id, kind, filename, mime_type, size_bytes, content, extracted, confirmed_at, uploaded_at)
         VALUES ($1,$2,$3,'application/pdf',0,NULL,$4,$5,$5)`,
        [s.id, kind, `${s.id}_${kind === "commercial_invoice" ? "invoice" : "packing_list"}.pdf`, JSON.stringify(extracted), ago(-s.submit + 1, -2)],
      );
    }

    await seedTimeline(s, { carrier, pickupIso, declared, appointment, customsStatus, pallets });
  }

  // BK-002: the packing list has been missing for 30 hours, so the 24-hour reminder is due.
  await q(
    `INSERT INTO issues (shipment_id, code, severity, field_key, message, fix, owner_role, first_seen_at)
     VALUES ('BK-002','D-01','RED','D-01:packing_list','The packing list hasn''t been uploaded.','Upload the packing list for this shipment.','seller', now() - interval '30 hours')`,
  );
  await q("UPDATE shipments SET created_at = now() - interval '31 hours' WHERE id = 'BK-002'");

  await q(`UPDATE shipments SET declined_carriers = '["Carrier C"]' WHERE id = 'BK-114'`);
  for (const id of SAMPLE_IDS) await recheck(id, { role: "system" }, { email: false });
  await q("UPDATE shipments SET updated_at = (SELECT max(created_at) FROM events e WHERE e.shipment_id = shipments.id) WHERE id = ANY($1)", [SAMPLE_IDS]);

  return q(
    `SELECT s.id, s.seller_name, s.status, s.responsible_role AS who, left(s.pending_action, 60) AS pending,
       (SELECT count(*) FROM issues x WHERE x.shipment_id = s.id AND x.status = 'open') AS open_issues
     FROM shipments s WHERE s.id = ANY($1) ORDER BY s.id`,
    [SAMPLE_IDS],
  );
}

function docDetails(s: Sample, seller: (typeof SELLERS)[string], buyer: (typeof BUYERS)[string], partial: boolean) {
  const d = (value: string, source = "From the commercial invoice") => ({ value, source });
  const out: Record<string, unknown> = {
    exporter_address: d(seller.address), exporter_eori: d(seller.eori), buyer_name: d(buyer.name), buyer_address: d(buyer.address),
    invoice_number: d(`${s.seller.split(" ")[0].slice(0, 3).toUpperCase()}-${s.id.slice(3)}`), invoice_date: d(dmy(isoDay(s.submit - 1))),
    incoterms: d(`DAP ${s.city}`), reason_for_export: d("Sale"),
  };
  if (!partial) {
    out.items = Object.fromEntries(s.items.map((i) => [i.sku, {
      carton_dimensions_cm: d("40 x 30 x 30", "From the packing list"),
      carton_gross_weight_kg: d(String(Math.round((i.upc * i.kg + 0.8) * 10) / 10), "From the packing list"),
    }]));
  }
  return out;
}

const daysAgo = (iso: string) => (Date.now() - new Date(iso).getTime()) / 864e5;

async function seedTimeline(s: Sample, x: { carrier: (typeof CARRIERS)[number]; pickupIso: string | null; declared: boolean; appointment: string | null; customsStatus: string | null; pallets: number }) {
  const ev = (role: string, name: string | null, action: string, at: string) =>
    q("INSERT INTO events (shipment_id, actor_role, actor_name, action, created_at) VALUES ($1,$2,$3,$4,$5)", [s.id, role, name, action, at]);
  const mail = (kind: string, subject: string, at: string) =>
    q("INSERT INTO emails (shipment_id, kind, to_address, subject, body, error, sent_at) VALUES ($1,$2,$3,$4,$5,$6,$7)",
      [s.id, kind, SELLERS[s.seller].email, subject, `(sample email) ${subject}`, "Sample data: not sent.", at]);
  // Seller alert (Alerts page), as the app would have sent it: shown in the app, email in the log, Telegram not connected.
  const alert = (topic: string, kind: string, severity: string, title: string, lines: string[], at: string, actions: object[] | null = null, resolved = false) =>
    q(`INSERT INTO alerts (shipment_id, seller_name, topic, kind, severity, title, lines, actions, channels, read_at, resolved_at, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [s.id, s.seller, topic, kind, severity, title, JSON.stringify(lines), actions && JSON.stringify(actions),
       JSON.stringify({ email: { status: "outbox", detail: "Sample data: saved to the email log." }, telegram: { status: "not_connected", detail: "Telegram isn't connected yet (no bot token)." } }),
       resolved || daysAgo(at) > 2 ? at : null, resolved ? at : null, at]);
  const d0 = -s.submit;
  await ev("seller", s.seller.split(" ")[0], "Booking created", ago(d0 + 1));
  await ev("seller", s.seller.split(" ")[0], s.stage === "draft_missing_pl" ? "Uploaded the commercial invoice" : "Uploaded the commercial invoice and packing list", ago(d0 + 1, -1));
  await ev("seller", s.seller.split(" ")[0], `Chose ${s.carrier}`, ago(d0 + 1, -2));
  if (s.stage === "draft_missing_pl") return;
  await ev("seller", s.seller.split(" ")[0], `Submitted the booking with ${s.carrier}; collection requested for ${dmy(x.pickupIso!)}`, ago(d0, 2));
  if (s.stage === "carrier_requested") return;
  if (s.stage === "carrier_declined") {
    await ev("carrier", null, `${s.carrier} declined the collection: No express capacity on the requested day`, ago(d0, -4));
    await alert("carrier", "carrier_declined", "error", `${s.id}: the carrier declined. Choose another carrier`,
      [`${s.carrier} declined the collection for ${s.id}.`, `Reason: "No express capacity on the requested day"`, "Book the next-best carrier below. The collection request is sent to them straight away."],
      ago(d0, -4), [
        // Next-best for "Fastest" after Carrier C: B (3 days), then A (5 days); prices from the rate card.
        ...["Carrier B", "Carrier A"].map((name, i) => {
          const c = CARRIERS.find((k) => k.name === name)!;
          return { label: `Book ${name}${i === 0 ? " (recommended)" : ""}: £${(x.pallets * c.pricePerPallet[s.country]).toLocaleString("en-GB")}, ${c.transitDays} days, ${c.onTimePct}% on time`,
            action: "rebook-carrier", params: { carrier: name } };
        }),
        { label: "See all carriers", action: "open", params: { anchor: "carrier" } },
      ]);
    return;
  }
  await ev("carrier", null, `${s.carrier} confirmed the collection: ${dmy(x.pickupIso!)} at 09:30`, ago(d0, -6));
  await alert("carrier", "carrier_confirmed", "success", `${s.id}: collection booked with ${s.carrier}`,
    [`${s.carrier} has booked the collection for ${s.id}.`, `Collection: ${dmy(x.pickupIso!)} at 09:30`], ago(d0, -6));
  if (s.type === "Warehouse") {
    await ev("system", null, `Asked the warehouse in ${s.city} for a delivery slot`, ago(d0, -6));
    if (x.appointment === "proposed") {
      await ev("warehouse", "Tom", `Proposed a different delivery slot: ${dmy(isoDay(s.slot!))} at ${s.slotTime} – ${s.proposalNote}`, ago(1));
      await mail("appointment_proposed", `${s.id}: the warehouse proposed a different delivery slot`, ago(1));
      await alert("slot", "appointment_proposed", "warning", `${s.id}: the warehouse proposed a different delivery slot`,
        [`The warehouse in ${s.city} can't take ${s.id} at the requested time and has offered another slot:`, `${dmy(isoDay(s.slot!))} at ${s.slotTime}. Note: "${s.proposalNote}"`, "Accept it, or ask for another time:"],
        ago(1), [
          { label: `Accept ${dmy(isoDay(s.slot!))} at ${s.slotTime}`, action: "answer-slot", params: { accept: true } },
          { label: "Ask for another time", action: "answer-slot", params: { accept: false } },
        ]);
    }
    if (x.appointment === "confirmed") {
      await ev("warehouse", "Tom", `Confirmed the delivery slot: ${dmy(isoDay(s.slot!))} at ${s.slotTime}`, ago(Math.max(d0 - 1, 0), 1));
      await mail("appointment_confirmed", `${s.id}: delivery slot confirmed`, ago(Math.max(d0 - 1, 0), 1));
      await alert("slot", "appointment_confirmed", "success", `${s.id}: delivery slot booked at the warehouse`,
        [`The warehouse in ${s.city} has booked a delivery slot for ${s.id}.`, `Slot: ${dmy(isoDay(s.slot!))} at ${s.slotTime}`], ago(Math.max(d0 - 1, 0), 1));
    }
  }
  if (s.stage === "mismatch") {
    await ev("warehouse", "Tom", `Rejected the goods / flagged a mismatch: ${s.mismatch}`, ago(-(s.slot ?? 0), -3));
    await mail("goods_rejected", `${s.id}: the warehouse rejected the goods`, ago(-(s.slot ?? 0), -3));
    await alert("goods", "goods_rejected", "error", `${s.id}: the warehouse rejected the goods`,
      [`The warehouse in ${s.city} rejected the goods for ${s.id}.`, `Reason from the warehouse: "${s.mismatch}"`,
       "What to do: check what was shipped. If the booking is wrong, correct it in Clear2Ship (the warehouse is then asked to check again). If goods are missing, arrange to send them and tell the warehouse."],
      ago(-(s.slot ?? 0), -3), [{ label: "Correct the booking", action: "open", params: { anchor: "checks" } }]);
    return;
  }
  if (ORDER.indexOf(s.stage) >= ORDER.indexOf("received")) {
    await ev("warehouse", "Tom", "Received and accepted the goods: they match the booking", ago(-(s.slot ?? s.pickup ?? 0), -3));
    await mail("goods_result", `${s.id}: goods received by the warehouse`, ago(-(s.slot ?? s.pickup ?? 0), -3));
    await alert("goods", "goods_result", "success", `${s.id}: goods delivered and accepted at the warehouse`,
      [`The warehouse received ${s.id} and the goods match the booking.`, "It now goes to your freight forwarder for customs."], ago(-(s.slot ?? s.pickup ?? 0), -3));
  }
  if (!x.declared) return;
  await ev("forwarder", "Ana", `Declaration submitted (${dmy(isoDay(s.decl!))})`, ago(-s.decl!));
  if (s.customs) {
    await q("INSERT INTO customs_messages (shipment_id, raw_text, suggested_status, suggested_reason, suggested_next_steps, suggested_responsible, confirmed_status, confirmed_by, confirmed_at, created_by, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'forwarder',$10)",
      [s.id, s.customs.email, x.customsStatus ?? "Cleared", s.customs.reason || null, s.customs.next || null, s.customs.reason ? "seller" : null,
       s.stage === "email_pending" ? null : x.customsStatus, s.stage === "email_pending" ? null : "forwarder (Ana)",
       s.stage === "email_pending" ? null : ago(-s.decl! - 1), ago(-s.decl! - 1, 1)]);
    await ev("forwarder", "Ana", `Pasted a customs email${s.stage === "email_pending" ? " (suggested status: Cleared, not applied until confirmed)" : ""}`, ago(-s.decl! - 1, 1));
  }
  if (x.customsStatus && x.customsStatus !== "Cleared") {
    await ev("forwarder", "Ana", `Confirmed customs status: ${x.customsStatus} – "${s.customs!.reason}"`, ago(-s.decl! - 1));
    await mail("exception", `${s.id}: customs status is now "${x.customsStatus}"`, ago(-s.decl! - 1));
    const rejected = x.customsStatus === "Rejected";
    await alert("customs", "exception", rejected ? "error" : "warning",
      rejected ? `${s.id}: rejected by customs` : `${s.id}: on hold at customs, they need something from you`,
      [`Your shipment ${s.id} is ${rejected ? "rejected by customs" : "on hold at customs"}.`, `Reason, exactly as written by customs: "${s.customs!.reason}"`, `What to do: ${s.customs!.next}`,
       ...(rejected ? ["You can now correct the booking and documents in Clear2Ship, then tell your forwarder what you changed."] : []), "Who has to act: You (the seller)"],
      ago(-s.decl! - 1), [{ label: rejected ? "Correct and reply to customs" : "Reply to customs", action: "open", params: { anchor: "customs-reply" } }], !!s.reply);
  }
  if (s.reply) {
    await q("INSERT INTO customs_replies (shipment_id, message, created_by, created_at) VALUES ($1,$2,'seller',$3)", [s.id, s.reply, ago(1)]);
    await ev("seller", s.seller.split(" ")[0], `Replied to customs via the forwarder: ${s.reply}`, ago(1));
  }
  if (x.customsStatus === "Cleared") {
    if (s.customs) await ev("forwarder", "Ana", "Confirmed customs status: Cleared", ago(-s.decl! - 1));
    else await ev("forwarder", "Ana", "Confirmed customs status: Cleared", ago(-s.decl! - 2));
  }
  if (x.customsStatus === "Cleared") {
    await alert("customs", "customs_cleared", "success", `${s.id}: cleared by customs`, [`Customs has cleared ${s.id}.`, "Your forwarder will mark it as delivered when it arrives."], ago(-s.decl! - 1));
  }
  if (s.stage === "delivered") {
    await ev("forwarder", "Ana", "Marked as delivered", ago(-s.decl! - 3));
    await alert("booking", "delivered", "success", `${s.id}: delivered`, [`${s.id} has been delivered to ${s.city}.`], ago(-s.decl! - 3));
  }
}
