-- Clear2Ship database schema (Neon Postgres).
-- Safe to re-run: every object uses IF NOT EXISTS.

-- One row per shipment (the "booking"). Field names follow clear2ship_rules.md section 2
-- and the Bookings sheet of the Excel template. Blank = NULL, never a guessed value.
CREATE TABLE IF NOT EXISTS shipments (
  id                    TEXT PRIMARY KEY,               -- Booking ID, e.g. BK-001
  seller_name           TEXT,
  seller_email          TEXT,                           -- where alerts go (not a rule field)
  origin_city           TEXT,
  origin_country        TEXT DEFAULT 'United Kingdom',
  destination_city      TEXT,
  destination_country   TEXT,
  destination_type      TEXT,                           -- Warehouse / Business address
  ready_date            DATE,
  seller_priority       TEXT,                           -- Cheapest / Fastest / Most reliable / Balanced
  pallets               INTEGER,
  cartons               INTEGER,
  declared_value        NUMERIC(12,2),
  currency              TEXT DEFAULT 'GBP',
  gross_weight_kg       NUMERIC(10,2),
  appointment_booked    BOOLEAN,                        -- only asked when destination_type = Warehouse
  preferred_carrier     TEXT,

  raw_input             JSONB,                          -- original text of fields that failed to parse
  chat_state            JSONB,                          -- chat progress: fields the seller said they don't know, confirmed
  last_check            JSONB,                          -- snapshot of the latest check result (overall, carrier)
  submitted_at          TIMESTAMPTZ,                    -- seller pressed "Submit booking"

  status                TEXT NOT NULL DEFAULT 'Draft',
  pending_action        TEXT,                           -- plain words, e.g. "Upload the packing list"
  responsible_role      TEXT,                           -- seller / warehouse / forwarder / admin

  warehouse_result      TEXT,                           -- accepted / mismatch
  warehouse_note        TEXT,

  declaration_ref       TEXT,
  declaration_date      DATE,

  customs_status        TEXT,                           -- only ever set after a person confirms
  customs_reason        TEXT,                           -- exact words from the customs email

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT shipments_status_check CHECK (status IN (
    'Draft', 'Docs submitted', 'Warehouse accepted', 'Mismatch', 'Action required',
    'Ready for customs', 'Declaration submitted', 'Cleared', 'On hold', 'Rejected', 'Delivered'
  )),
  CONSTRAINT shipments_customs_status_check CHECK (
    customs_status IS NULL OR customs_status IN ('Cleared', 'On hold', 'Rejected')
  )
);

-- One row per item line (Items sheet).
CREATE TABLE IF NOT EXISTS items (
  id                 SERIAL PRIMARY KEY,
  shipment_id        TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  position           INTEGER NOT NULL DEFAULT 1,
  sku                TEXT,
  description        TEXT,
  hs_code            TEXT,                              -- stored as text so leading zeros survive
  quantity           INTEGER,
  unit_price         NUMERIC(12,2),
  units_per_carton   INTEGER,
  cartons            INTEGER,
  unit_weight_kg     NUMERIC(10,3),
  country_of_origin  TEXT,
  raw_input          JSONB
);
CREATE INDEX IF NOT EXISTS items_shipment_idx ON items(shipment_id);

-- Uploaded commercial invoices and packing lists. The file itself is kept in Postgres
-- (no extra storage service). `extracted` holds what Gemini read: per field the value
-- and the exact source words; missing fields are null.
CREATE TABLE IF NOT EXISTS documents (
  id            SERIAL PRIMARY KEY,
  shipment_id   TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('commercial_invoice', 'packing_list')),
  filename      TEXT NOT NULL,
  mime_type     TEXT NOT NULL,
  size_bytes    INTEGER NOT NULL,
  content       BYTEA,
  extracted     JSONB,
  confirmed_at  TIMESTAMPTZ,                            -- seller reviewed the extracted fields
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS documents_shipment_idx ON documents(shipment_id);

-- Problems found by the checks (code only). Kept open until a re-check no longer finds them,
-- so the 24h reminder and 48h admin alert can be timed from first_seen_at.
CREATE TABLE IF NOT EXISTS issues (
  id             SERIAL PRIMARY KEY,
  shipment_id    TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  code           TEXT NOT NULL,                         -- R-01..R-10, D-01..D-05, INPUT
  severity       TEXT NOT NULL CHECK (severity IN ('RED', 'AMBER')),
  field_key      TEXT,                                  -- lets a re-check match the same problem
  message        TEXT NOT NULL,
  fix            TEXT NOT NULL,
  owner_role     TEXT NOT NULL,                         -- seller / warehouse / forwarder
  status         TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  first_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS issues_open_idx ON issues(shipment_id) WHERE status = 'open';

-- Customs / forwarder emails pasted into a shipment, with Gemini's suggestion and the
-- person's decision. The shipment status only changes when confirmed_status is set.
CREATE TABLE IF NOT EXISTS customs_messages (
  id                     SERIAL PRIMARY KEY,
  shipment_id            TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  raw_text               TEXT NOT NULL,
  suggested_status       TEXT CHECK (suggested_status IS NULL OR suggested_status IN ('Cleared', 'On hold', 'Rejected')),
  suggested_reason       TEXT,                          -- exact words copied from raw_text
  suggested_next_steps   TEXT,
  suggested_responsible  TEXT,
  confirmed_status       TEXT CHECK (confirmed_status IS NULL OR confirmed_status IN ('Cleared', 'On hold', 'Rejected')),
  confirmed_by           TEXT,
  confirmed_at           TIMESTAMPTZ,
  dismissed_at           TIMESTAMPTZ,
  created_by             TEXT NOT NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Timeline: every change, who made it and when.
CREATE TABLE IF NOT EXISTS events (
  id           SERIAL PRIMARY KEY,
  shipment_id  TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  actor_role   TEXT NOT NULL,                           -- seller / warehouse / forwarder / admin / system
  actor_name   TEXT,
  action       TEXT NOT NULL,                           -- short plain sentence
  details      JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS events_shipment_idx ON events(shipment_id, created_at);

-- Every email we tried to send (also stops duplicate reminders).
CREATE TABLE IF NOT EXISTS emails (
  id           SERIAL PRIMARY KEY,
  shipment_id  TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('issues', 'reminder_24h', 'admin_48h', 'exception')),
  to_address   TEXT NOT NULL,
  subject      TEXT NOT NULL,
  body         TEXT NOT NULL,
  provider_id  TEXT,
  error        TEXT,
  sent_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS emails_shipment_idx ON emails(shipment_id, kind);

-- Chat history for bookings made by chat.
CREATE TABLE IF NOT EXISTS chat_messages (
  id           SERIAL PRIMARY KEY,
  shipment_id  TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  role         TEXT NOT NULL CHECK (role IN ('seller', 'app')),
  content      TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chat_shipment_idx ON chat_messages(shipment_id, created_at);

-- ---------------------------------------------------------------- v2: carrier choice, confirmations, ticks, document details
-- (ALTER … IF NOT EXISTS so existing databases are upgraded in place)

ALTER TABLE shipments ADD COLUMN IF NOT EXISTS selected_carrier TEXT;            -- the carrier the seller chose
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS acknowledged JSONB;              -- AMBER items the seller ticked: { key: { message, by, at } }
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS doc_details JSONB;               -- invoice / packing list details not in the booking
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS collection_date DATE;            -- requested by the seller on submit
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS collection_window TEXT;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS carrier_status TEXT;             -- requested / confirmed / declined
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS carrier_ref TEXT;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS carrier_pickup_date DATE;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS carrier_pickup_time TEXT;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS carrier_note TEXT;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS carrier_confirmed_at TIMESTAMPTZ;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS appointment_status TEXT;         -- not_needed / seller_booked / requested / confirmed / declined
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS appointment_ref TEXT;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS appointment_date DATE;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS appointment_time TEXT;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS appointment_note TEXT;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS appointment_confirmed_at TIMESTAMPTZ;

-- (the list of email kinds is set once, in the latest section below)

-- ---------------------------------------------------------------- v3: slot proposals, customs replies, resubmits

ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_kind_check;
ALTER TABLE documents ADD CONSTRAINT documents_kind_check CHECK (kind IN ('commercial_invoice', 'packing_list', 'supporting'));

ALTER TABLE shipments ADD COLUMN IF NOT EXISTS customs_reply_at TIMESTAMPTZ;   -- seller answered the customs request
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS goods_received_at TIMESTAMPTZ;  -- warehouse accepted or flagged the goods

-- What the seller sent back when customs asked for something (text, plus an optional file in documents).
CREATE TABLE IF NOT EXISTS customs_replies (
  id            SERIAL PRIMARY KEY,
  shipment_id   TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  message       TEXT NOT NULL,
  document_id   INTEGER REFERENCES documents(id) ON DELETE SET NULL,
  created_by    TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- (email kinds: see the latest section below)
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS customs_next_steps TEXT;        -- what customs asked for (confirmed by a person)
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS customs_responsible TEXT;

-- ---------------------------------------------------------------- v4: seller alerts (app + email + Telegram)

-- Every update for a seller. Shown in the app, and also sent by email and Telegram.
CREATE TABLE IF NOT EXISTS alerts (
  id            SERIAL PRIMARY KEY,
  shipment_id   TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  seller_name   TEXT,
  topic         TEXT NOT NULL,                      -- carrier / slot / goods / customs / problems / booking
  kind          TEXT NOT NULL,                      -- e.g. carrier_declined
  severity      TEXT NOT NULL CHECK (severity IN ('success', 'info', 'warning', 'error')),
  title         TEXT NOT NULL,
  lines         JSONB NOT NULL,                     -- plain sentences
  actions       JSONB,                              -- [{ label, action, params }] the seller can do from the alert
  channels      JSONB,                              -- { email: {status, detail}, telegram: {status, detail} }
  read_at       TIMESTAMPTZ,
  resolved_at   TIMESTAMPTZ,                        -- the action was taken (here or elsewhere)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS alerts_seller_idx ON alerts(seller_name, created_at DESC);
CREATE INDEX IF NOT EXISTS alerts_shipment_idx ON alerts(shipment_id, created_at DESC);

ALTER TABLE shipments ADD COLUMN IF NOT EXISTS seller_telegram_chat_id TEXT;  -- where Telegram alerts go
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS declined_carriers JSONB;       -- carriers that declined this collection

ALTER TABLE emails DROP CONSTRAINT IF EXISTS emails_kind_check;
ALTER TABLE emails ADD CONSTRAINT emails_kind_check CHECK (kind IN (
  'issues', 'reminder_24h', 'admin_48h', 'exception', 'submitted',
  'carrier_request', 'carrier_confirmed', 'carrier_declined',
  'appointment_request', 'appointment_confirmed', 'appointment_declined', 'appointment_proposed',
  'customs_reply', 'resubmitted', 'goods_result', 'goods_rejected'
));
