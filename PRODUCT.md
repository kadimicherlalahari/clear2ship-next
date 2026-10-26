# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Sellers:** UK small businesses exporting goods to Germany, France and the Netherlands. They create bookings, fix problems, upload the commercial invoice and packing list, choose a carrier, and act on alerts.
- **Warehouse:** the destination warehouse. Answers delivery slot requests and checks the goods on arrival.
- **Freight forwarder:** declares shipments to customs and handles holds, rejections and resubmissions.
- **Carrier:** confirms or declines collection requests.
- **Admin:** sees everything, runs reminders, resets sample data, reads the email log.

There is no login; a role switcher at the top picks the role.

## Product Purpose

Help sellers avoid export document mistakes, and alert them quickly when documents are missing, a carrier or warehouse says no, or customs has an issue. Success: every planted error is caught before customs, and the seller always knows the next step and who owns it.

## Positioning

Plain code makes every decision (the ten rules R-01 to R-10, document checks D-01 to D-05, carrier ranking); Gemini only reads text and documents into fields and never guesses a value. People confirm everything that matters: the carrier, the warehouse slot, the goods, and every customs status.

## Operating Context

- Booking by chat, step-by-step form, or Excel upload in a fixed template (Bookings and Items sheets).
- Statuses: Draft → Docs submitted → Warehouse accepted / Mismatch → Action required → Ready for customs → Declaration submitted → Cleared / On hold / Rejected → Delivered.
- Each role has its own home: seller shipment list, warehouse deliveries board, customs board, collections board. Each shipment has a page with pipeline, checks, carrier choice, booking overview, documents, submit, confirmations, chat and timeline.
- Alerts reach the seller in the app, by email and on Telegram, with actions they can take from the alert.

## Capabilities and Constraints

- Next.js on Vercel, Neon Postgres, Gemini, Resend, Telegram bot. No other services.
- Never submits to customs, never books anything itself (it requests; the carrier and warehouse confirm), never says a shipment is "compliant", never shows a customs status a person hasn't confirmed.
- RED / AMBER / GREEN severity must stay instantly readable.
- Plain, friendly language throughout.

## Brand Commitments

- Name: Clear2Ship.
- The user pinned a visual reference for the redesign: the "Swift – Courier & Delivery Service Website UI" Dribbble shot (black + vivid orange on a light ground, pill navigation and buttons, bold headlines with one orange word, handwritten accent notes, isometric logistics scenes, an orange-dot delivery tracker). Confirmed choices: drawn logistics illustrations (no rendered 3D), playful-but-calm motion that respects reduced-motion settings, black + orange colours, a hero banner on each role's home page.
- Hero headlines (confirmed): Seller "Ship it. Check it. Clear it." · Warehouse "Every dock, on time." · Customs "Declare it. Clear it." · Carrier "Pick up. Move. Deliver."
- Must not feel too busy to work in: dashboards and tables stay easy to scan every day.

## Evidence on Hand

- Sample data: 17 shipments covering every stage, with alerts (`src/lib/seed.ts`). All sellers, buyers and addresses are synthetic.
- No customers, testimonials, delivery volumes or performance figures exist. Stats shown anywhere must be live counts from the app, never invented figures.

## Product Principles

1. The next step and who owns it are always visible.
2. Code decides, people confirm, AI only reads.
3. Problems are shown where they can be fixed.
4. Never claim what hasn't happened.

## Accessibility & Inclusion

Keep text contrast readable, keyboard use working, and motion optional (respect reduced-motion settings).
