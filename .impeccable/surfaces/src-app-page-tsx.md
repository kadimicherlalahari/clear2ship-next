---
version: 1
slug: "src-app-page-tsx"
primary_target: "src/app/page.tsx"
related_targets: ["src/app/layout.tsx","src/components/ShipmentView.tsx"]
---

# Clear2Ship app shell, role home pages and shipment page

Scope: whole web app restyle (UI/UX only, no functional change). Mode: Operate, with a Persuade-flavoured hero banner on each role's home page.
Task: sellers, warehouse, forwarder and carrier each work through their queue daily; the shipment page is where problems are fixed and the next step is taken.
Constraints: not too busy to work in; RED/AMBER/GREEN stay instantly readable; stats are live counts only; reduced-motion respected.
Pinned reference: "Swift – Courier & Delivery Service Website UI" (Dribbble). The pinned brief beats the roll (seed f2f85873, assigned index and challengers not used).

## Direction contract

THESIS: A dispatch depot you can read at a glance: black ink, one hot safety-orange for "move this now", parcels and vans drawn in a clean isometric line. Refuses the grey SaaS admin template with blue links and identical stat cards.

OWN-WORLD: Light warm-grey depot floor (#F4F2EE), white parcel-card surfaces with soft offset shadows and 20px+ radii, ink #141414, safety orange #FF5A1F reserved for primary actions, current stage and the one emphasised word. Pill nav floating over the page, pill buttons with an arrow, Archivo (wide, heavy for headlines; normal width for UI), Caveat handwritten notes as margin annotations. Isometric SVG vans, cartons, pallets, a conveyor and a small depot in ink + orange + kraft.

STORY: The user sees what is moving, what is stuck, and what they must do next, then does it in place.

FIRST VIEWPORT: Floating pill nav. Left: huge two-line headline with the last word in orange, one sentence, primary pill CTA. Right: isometric depot scene with a van on a conveyor road; a Caveat note pinned to it. Below: a live stats strip. The work list starts within the first scroll.

FORM: Pinned reference (Swift courier site) translated to an operational app; own list not used; seed key f2f85873.

Signature interaction: the pipeline is a road; a small van drives to the current stage, boxes drop in on submit, a customs stamp thumps on Cleared, confetti-free parcel pop on Delivered.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
