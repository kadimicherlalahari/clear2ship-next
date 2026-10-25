# Clear2Ship – Export Documentation & Shipment Tracker

Helps sellers avoid export document mistakes, and alerts them quickly when documents are missing or customs has an issue.
The rules come from `clear2ship_rules.md` (input checks, R-01 to R-10, carrier selection, test cases T1–T10).

## Run it locally

```bash
npm install
cp .env.example .env.local   # then fill in GEMINI_API_KEY (the rest can stay empty locally)
npm run dev -- -p 3100        # http://localhost:3100
```

- **Database:** with `DATABASE_URL` empty, the app uses a local Postgres (PGlite) stored in `.data/pglite`. It is created automatically, with the 3 sample shipments loaded by `npm run db:seed`. Set `DATABASE_URL` to a Neon connection string and the same code and schema run on Neon (`npm run db:migrate && npm run db:seed`).
- **Email:** with `RESEND_API_KEY` empty, emails are saved and shown on the **Outbox** page instead of being sent.
- **Gemini:** needs `GEMINI_API_KEY`. If Gemini can't be reached, the chat switches to a step-by-step form and documents can be typed in by hand.
- PGlite allows one process at a time: stop the dev server before running `npm run db:seed` or the scripts below, or use **Admin → Reset sample data** in the app.

## Who does what

| | |
|---|---|
| Gemini | Reads chat messages, invoices/packing lists and customs emails into fields. Each value must quote the exact words it came from; code drops anything it can't find in the text. Writes a short plain-words summary of a code result (dropped if it mentions any number code didn't produce). |
| Code | Missing fields and questions (max 3, fixed order), input checks, R-01 to R-10, document checks D-01 to D-05, carrier choice, statuses, alerts. |
| People | Seller confirms booking details, document fields and fixes. Warehouse accepts or flags a mismatch. Forwarder records the declaration. Forwarder/Admin confirm any customs status. |

The app never submits to customs and never says a shipment is "compliant". Collections and delivery slots are requested from the carrier and warehouse, and only shown as booked once they confirm.

## Workflow and statuses

Draft → Docs submitted → Warehouse accepted / Mismatch → Action required → Ready for customs → Declaration submitted → Cleared / On hold / Rejected → Delivered

Roles (switcher at the top, no login): Seller, Warehouse, Freight forwarder, Carrier, Admin. Each role has its own home page:

- **Seller / Admin:** all shipments with status, a small pipeline, pending action, who's responsible, and a status filter.
- **Warehouse:** *Scheduled deliveries* (booked slots grouped by day, with a 7-day load strip; accept or reject goods on arrival), *Slot requests* (accept, propose another time, or decline), and *History* (slot and goods outcome, where the shipment is now, and whether the seller was told).
- **Freight forwarder:** *Ready to declare*, *With customs* (days waiting), *On hold / rejected* (what customs asked for, the seller's reply, resubmit), *Emails to confirm*, *Coming to you*, *Cleared and delivered*.
- **Carrier:** collection requests to confirm or decline, booked collections, and history.

Each shipment page starts with a compact pipeline (Draft → Collection & slot → Warehouse check → Customs → Cleared → Delivered) showing where it is and whether it's stuck.

**After a rejection:** if customs puts a shipment on hold or rejects it, the seller sees exactly what was asked. They can correct the booking and documents (unlocked during the hold) and reply with a note and a file. The forwarder gets the reply and records the resubmission. If the warehouse rejects the goods, the seller corrects the booking and the warehouse checks again.

1. **New booking:** Chat, Form, or Upload Excel (the Bookings and Items sheets of `public/bookings_template.xlsx`).
2. **Checks with fixes:** every problem on the shipment page has an input right below it. A fix is tried before it's saved. If the problem would still be there (e.g. an HS code with 5 digits), nothing is saved and the seller sees why. AMBER items can be fixed, or ticked as "I've checked this", and the tick is recorded on the timeline.
3. **Carrier recommendations:** carriers ranked for the seller's priority. The seller selects one, and can rank again for another priority (Regenerate recommendations).
4. **Documents:** upload the commercial invoice and packing list. Quantities, value, cartons and weight are compared with the booking (D-01 to D-05). When they disagree, both values are shown side by side, and the seller picks which is right. *The document is right* updates the booking (checked and logged). *The booking is right* means uploading a corrected document. *The document was read wrong* means entering what it really says; the original reading is kept, and the value is marked "corrected by the seller" for the forwarder to see. Below that, only the details the booking doesn't (fully) have: exporter address and EORI, buyer name and address, invoice number and date, Incoterms, reason for export, carton size and weight per item. These are filled in from the confirmed documents, or typed. Then an overview of everything both documents need, with where each value comes from.
5. **Submit booking:** unlocks when booking details are complete, no RED problems, every AMBER fixed or ticked, a carrier chosen, both documents confirmed, and all document details given. The seller also ticks that the summary is correct. Submit asks for the collection date and time.
6. **Confirmations by people:** the chosen carrier gets a collection request and confirms (date, time, reference) or declines. Once the carrier confirms, the destination warehouse is asked for a delivery slot (warehouse destinations only, unless the seller already booked one). It confirms or declines. Nothing shows as booked until they confirm. If the booking changes after submit (pallets, weight, route, date), the carrier is asked again.
7. **Warehouse goods check:** accept or flag a mismatch. Ready for customs = collection and slot confirmed, goods accepted, no RED problems.
8. **Customs:** the forwarder records the declaration they submitted. A pasted customs email gets a suggested status, a person confirms it, and On hold / Rejected emails the seller the exact reason.
9. **Chat on each booking:** change details, or ask a question. Answers come only from the shipment's own facts.
10. **Alerts:** problems email the seller after submit. The 24 h reminder and 48 h admin alert also cover complete drafts (e.g. a missing packing list). Collection and slot requests go to `CARRIER_EMAIL` / `WAREHOUSE_EMAIL`, and confirmations and declines to the seller.

The app still never submits to customs or says a shipment is "compliant".

## Tests

```bash
npm test                                  # T1–T10 + other rule/chat tests (vitest)
npx tsx scripts/make-test-workbook.ts     # builds fixtures/test_cases.xlsx (T1–T9 + input errors) to try Upload Excel
npx tsx scripts/remind-at.ts 20           # runs the reminder check as if 20 hours from now
npm run db:seed                           # 17 sample shipments, one for every stage (dev server stopped), or Admin → Reset sample data
```

## Choices made where the rules were silent

- R-10 uses today's date in the UK (Europe/London).
- In the Excel upload, row 3 (the template's grey example row) is checked like any other booking.
- When the seller has no priority, Balanced is used and shown as an AMBER note (counts towards an AMBER result).
- A blank HS code or country of origin isn't an input error. R-01 / R-09 report it instead, as the template says HS code may be blank.
- D-03 (value) and D-05 (weight) need an exact match. R-02's 1% tolerance only applies to R-02.
- The collection date can't be before the ready date or in the past. The delivery slot can't be before the confirmed collection.
- The expected delivery sent to the warehouse = confirmed collection date + the carrier's transit days (calendar days).
- R-10 (ready date today or later) is judged on the day the booking was submitted, so shipments already on the move don't get a false warning.
- The warehouse can only receive goods once the delivery slot is confirmed (warehouse destinations).
- Drafts aren't emailed straight away (the seller is on screen); they get the 24 h reminder once the booking details are complete.
