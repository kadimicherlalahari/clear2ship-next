---
name: Clear2Ship
description: A dispatch depot you can read at a glance; export paperwork checked before customs.
colors:
  safety-orange: "#ff5a1f"
  safety-orange-bright: "#ff7a3d"
  safety-orange-deep: "#ed4a10"
  safety-orange-ink: "#bf3a0b"
  safety-orange-wash: "#fff4ed"
  safety-orange-tint: "#ffc8a6"
  ink: "#151412"
  ink-raised: "#282522"
  depot-floor: "#f4f2ee"
  parcel-white: "#ffffff"
  dust: "#f7f5f1"
  crate-grey: "#efebe5"
  seam: "#e3ded6"
  rule: "#cdc6bb"
  faded: "#a0998e"
  muted: "#736d65"
  graphite: "#57524c"
  graphite-strong: "#403c37"
  kraft: "#d9a46a"
  kraft-dark: "#b97f45"
  kraft-light: "#ecc493"
  severity-red: "oklch(57.7% 0.245 27.325)"
  severity-red-text: "oklch(50.5% 0.213 27.518)"
  severity-amber: "oklch(82.8% 0.189 84.429)"
  severity-amber-text: "oklch(47.3% 0.137 46.201)"
  severity-green: "oklch(62.7% 0.194 149.214)"
  severity-green-text: "oklch(52.7% 0.154 150.069)"
typography:
  display:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.5rem, 6vw, 3.6rem)"
    fontWeight: 800
    lineHeight: 1.02
    letterSpacing: "-0.025em"
    fontVariation: "'wdth' 125"
  headline:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 800
    lineHeight: 1.33
    letterSpacing: "-0.025em"
    fontVariation: "'wdth' 115"
  stat:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 800
    lineHeight: 1.2
    fontFeature: "'tnum' 1"
    fontVariation: "'wdth' 115"
  title:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.55
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.43
  label:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.33
    letterSpacing: "0.025em"
  hand:
    fontFamily: "Caveat, Bradley Hand, cursive"
    fontSize: "1.7rem"
    fontWeight: 600
    lineHeight: 1
rounded:
  sm: "0.25rem"
  md: "0.625rem"
  lg: "0.875rem"
  xl: "1.25rem"
  2xl: "1.75rem"
  hero: "2rem"
  full: "9999px"
spacing:
  pill-y: "6px"
  pill-x: "14px"
  button-y: "8px"
  button-x: "16px"
  card: "24px"
  card-compact: "20px"
  stack: "20px"
  container: "72rem"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.parcel-white}"
    typography: "{typography.body}"
    rounded: "{rounded.full}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.ink-raised}"
  button-accent:
    backgroundColor: "{colors.safety-orange}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.full}"
    padding: "8px 16px"
  button-accent-hover:
    backgroundColor: "{colors.safety-orange-bright}"
  button-hero:
    backgroundColor: "{colors.safety-orange}"
    textColor: "{colors.ink}"
    rounded: "{rounded.full}"
    padding: "10px 20px"
  button-secondary:
    backgroundColor: "{colors.parcel-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.full}"
    padding: "8px 16px"
  button-ghost:
    textColor: "{colors.graphite-strong}"
    rounded: "{rounded.full}"
    padding: "8px 16px"
  button-ghost-hover:
    backgroundColor: "{colors.crate-grey}"
  nav-pill:
    textColor: "{colors.graphite}"
    rounded: "{rounded.full}"
    padding: "6px 14px"
  nav-pill-active:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.parcel-white}"
  card:
    backgroundColor: "{colors.parcel-white}"
    rounded: "{rounded.2xl}"
    padding: "24px"
  hero-banner:
    backgroundColor: "{colors.parcel-white}"
    rounded: "{rounded.hero}"
  next-step-panel:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.parcel-white}"
    rounded: "{rounded.2xl}"
    padding: "16px"
  input:
    backgroundColor: "{colors.parcel-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "6px 8px"
  status-badge:
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "2px 10px"
  level-badge:
    rounded: "{rounded.sm}"
    padding: "2px 6px"
---

# Design System: Clear2Ship

## Overview

**Creative North Star: "The Dispatch Depot"**

Clear2Ship looks like a working parcel depot read from the gantry: a warm grey concrete floor, white parcel-card surfaces, black ink for everything that is text or structure, and one hot safety orange that means "move this now" or "you are here". The world is drawn, not rendered: vans, cartons, pallets, a conveyor and a small depot sit in a clean isometric line with a single ink stroke, filled in ink, white, kraft and orange.

It is an operating tool first. The hero banner on each role's home page carries the personality (a wide, heavy freight-signage headline with an orange final line, a handwritten margin note, an isometric scene, a strip of live counts); everything below it stays calm and scannable: pill tabs, white cards, plain tables, small status pills. Motion is playful but finite: scenes and milestones play once and then rest.

The system refuses the grey SaaS admin template: no blue links, no row of identical icon stat cards, no rendered 3D. RED / AMBER / GREEN severity keeps its own untouched palette so it is always readable against the orange.

**Key Characteristics:**
- Warm depot-floor ground (`depot-floor`) with white cards; ink, not grey-blue, for text and active states.
- One accent, safety orange, for action, position, selection and focus; never for severity.
- Pills everywhere you click: nav, tabs, buttons, role switcher, filter chips, status badges.
- Archivo throughout; its 125% wide, 800 weight cut only for page titles, 115% for big numbers and the wordmark.
- Caveat handwriting as a single decorative margin note.
- Isometric line-drawn illustration kit in ink + white + kraft + orange.
- Motion plays once on arrival, then rests; reduced motion collapses it.

## Colors

A warm neutral ramp from depot floor to ink, one safety orange, kraft for parcels, and the stock severity hues left alone.

### Primary
- **Safety Orange** (`safety-orange`): the primary action fill (hero "New booking" pill, accent Button), the current stop on the pipeline road, lane dashes on the road, the unread count, the active tab count, the global focus outline, and the orange faces and stripes of the drawn van, depot door and CLEARED stamp. Ink text sits on it, never white.
- **Bright Orange** (`safety-orange-bright`): hover state of orange fills.
- **Deep Orange** (`safety-orange-deep`): orange as large text only: the accent line of the hero headline and the one act-now hero stat (large text, at least 3:1 on white). Also the unread dot and selected radio fill.
- **Orange Ink** (`safety-orange-ink`): orange at small sizes: the Caveat margin note, "N details" toggles in the timeline.
- **Orange Wash** (`safety-orange-wash`) and **Orange Tint** (`safety-orange-tint`): selected-option backgrounds (chosen carrier, chosen check answer, today's column on the warehouse board, customs reply panels) and text selection.

### Tertiary
- **Kraft** (`kraft`, `kraft-dark`, `kraft-light`): cardboard cartons in the illustrations only (left / right / top faces). Not a UI colour.

### Neutral
- **Ink** (`ink`): body text, headlines, primary buttons, active nav and tab pills, the role switcher, the Next-step panel, toast background, and every illustration stroke.
- **Ink Raised** (`ink-raised`): primary button hover, the asphalt of the pipeline road.
- **Depot Floor** (`depot-floor`): page background.
- **Parcel White** (`parcel-white`): cards, hero banner, header bar, tab rail, secondary buttons.
- **Dust / Crate Grey** (`dust`, `crate-grey`): table header band, info notes, ghost and nav hover, inactive pipeline stops, name input.
- **Seam / Rule** (`seam`, `rule`): card borders (seam at 80%), dividers, secondary-button rings, dashed empty-state border, scrollbar.
- **Faded / Muted / Graphite** (`faded`, `muted`, `graphite`, `graphite-strong`): upcoming pipeline labels, metadata and table labels, secondary text, ghost button text.

### Severity (untouched Tailwind defaults)
- **Red** (`severity-red`, text `severity-red-text`), **Amber** (`severity-amber`, text `severity-amber-text`), **Green** (`severity-green`, text `severity-green-text`): LevelBadge fills, stuck pipeline stops, red/amber hero stats, errors, success notes. These are Tailwind v4's stock OKLCH values; the remap in `globals.css` deliberately leaves them alone.

### Named Rules
**The Move-This-Now Rule.** Orange means one of: the action to take, where the shipment is, what is selected or focused, or what is unread. On a role home page the hero carries exactly one orange headline line, one orange primary CTA and one orange act-now count. Orange is never body copy and never a severity.

**The Severity Stands Alone Rule.** RED / AMBER / GREEN keep their own hues and fills; orange never stands in for amber or red, and a stuck pipeline stop turns red or amber instead of orange.

**The Ink Link Rule.** Links are ink, semibold, with no underline at rest; on hover and keyboard focus they take a 2px safety-orange underline offset 4px. No blue, no orange link text.

## Typography

**Display Font:** Archivo, variable width axis (with ui-sans-serif, system-ui)
**Body Font:** Archivo at normal width
**Accent Font:** Caveat 600/700 (with Bradley Hand, cursive)

**Character:** One grotesque doing two jobs: stretched and heavy it reads like freight signage on a trailer; at normal width it is a quiet, legible UI face. Caveat is a felt-tip note someone scribbled on the board.

### Hierarchy
- **Display** (800, 125% width, 2.5rem / 3rem / 3.6rem by breakpoint, line-height 1.02, -0.025em, balanced): every `h1`, global. Hero headlines on two or three lines with the final line in Deep Orange; shipment IDs on the shipment page at 2.25rem / 3rem.
- **Headline** (800, 115% width, 1.5rem): list section heads such as "Your shipments".
- **Stat** (800, 115% width, 1.875rem, tabular figures): hero stats strip values.
- **Title** (700, 1.125rem, -0.025em): Card and Timeline headings.
- **Body** (400, 0.875rem, 1.43): tables, forms, panels; 1rem for the hero sentence, capped at ~28rem.
- **Label** (600, 0.75rem, 0.025em tracking, uppercase): table header cells, the timeline day divider, and field-group labels inside panels ("Booking says"). Never above a headline.
- **Hand** (Caveat 600, 1.5rem to 1.7rem, line-height 1, rotated about -6deg): the hero margin note and the empty-state line.

### Named Rules
**The Freight Signage Rule.** Wide cuts are for titles and big numbers only (125% for `h1`, 115% for section heads, stats and the wordmark). Buttons, nav, tables and forms stay at normal width.

**The Margin Note Rule.** One Caveat note per surface, short, lowercase, in Orange Ink, decorative and `aria-hidden`. It never carries information the user needs.

**The Tabular Rule.** Tables, stats and `time` elements use tabular figures so counts and dates line up.

## Layout

A single centred column, max 72rem with 16px side padding, on the depot floor. The header is a sticky floating pill bar 12px from the top edge; on phones it collapses to one row (wordmark plus an ink "Menu" pill) and the links and role switcher open below it inside the same white shape. Page sections stack with a 20px rhythm. The hero banner is a two-column grid on medium screens and up (copy about 1.05fr, scene 1fr), single column on phones, with the stats strip below as a 2x2 grid on phones and a single divided row from 640px. Cards pad 20px on phones and 24px from 640px. The work list starts within the first scroll. Breakpoints are Tailwind defaults (640px, 768px, 1024px).

## Elevation & Depth

Layered and soft. White surfaces float a little above the floor with long, low-opacity, negatively spread shadows tinted with ink, plus a hairline ring; there are no hard offset shadows. Depth increases with how floating an element is: cards sit low, the header bar sits higher, toasts highest.

### Shadow Vocabulary
- **Resting** (`box-shadow: 0 1px 2px rgb(21 20 18 / 0.05), 0 10px 24px -16px rgb(21 20 18 / 0.22)`): cards, hero banner, tab rail, alerts.
- **Floating** (`box-shadow: 0 2px 4px rgb(21 20 18 / 0.06), 0 18px 36px -18px rgb(21 20 18 / 0.3)`): header pill bar, Next-step panel, button hover, lift hover.
- **Overlay** (`box-shadow: 0 4px 8px rgb(21 20 18 / 0.06), 0 28px 56px -24px rgb(21 20 18 / 0.35)`): milestone toast.

### Named Rules
**The Soft Lift Rule.** Interactive cards and the hero CTA rise 2px and step from Resting to Floating on hover (180ms, cubic-bezier(0.22, 1, 0.36, 1)); with reduced motion they do not move.

## Shapes

Rounded and friendly. Anything you press or that names a state is a full pill: buttons, nav links, tabs, role switcher, filter chips, status badges, counts. Containers use large radii: cards and panels 1.75rem, the hero banner 2rem, the header 1.75rem on phones and a full pill from 640px. Selectable option rows use 1.25rem, notes 0.875rem, text inputs 0.625rem. LevelBadges (RED / AMBER / GREEN) keep a small 0.25rem tag corner so severity reads as a label, not a button. Borders are hairlines in Seam; empty states use a dashed Rule border. Illustrations are isometric prisms at 30 degrees with a 1.4px round-joined ink stroke.

## Components

### Buttons
Tactile pills with an optional trailing arrow.
- **Shape:** full pill, 8px 16px, 0.875rem semibold, 6px icon gap.
- **Primary:** Ink fill, white text; hover Ink Raised plus Floating shadow; press nudges down 1px.
- **Accent:** Safety Orange fill with ink text; hover Bright Orange. The hero version is larger (10px 20px), carries an arrow and the lift.
- **Secondary:** white with an inset Rule ring that turns ink on hover.
- **Danger:** severity red fill, white text. **Ghost:** graphite text, Crate Grey on hover.
- **Disabled:** Rule fill, graphite text, no shadow.
- **Focus:** global 2.5px Safety Orange outline, 2px offset.

### Chips and badges
- **StatusBadge:** pill, 0.75rem medium, tinted fill with inset ring per status (neutral greys for Draft and in-progress, red/amber/green tints for problems and clearance).
- **LevelBadge:** solid severity fill, 11px bold, small tag corner.
- **Filter chips:** small white pills with Seam ring; selected adopts the role chip colour with a 2px ring.

### Cards / Containers
- **Corner Style:** 1.75rem.
- **Background:** Parcel White.
- **Shadow Strategy:** Resting.
- **Border:** 1px Seam at 80%.
- **Internal Padding:** 20px, 24px from 640px; title row 12px above content.
- **Next-step panel:** an ink card with "Next step:" in bright orange and white text, the one inverted surface on the shipment page.

### Inputs / Fields
- **Style:** white, 1px Rule border, 0.625rem radius, 6px 8px padding, 0.875rem.
- **Focus:** border and 1px ring turn Safety Orange; caret, checkbox and radio accents are orange.
- **Header fields** are pills: the role switcher is an ink pill select, the name field a Crate Grey pill.

### Navigation
- **Header:** white floating pill bar with Floating shadow and a Seam ring; wordmark "clear2ship." in 800 / 115% width with an orange full stop.
- **Links:** 0.875rem medium pills, graphite at rest, Crate Grey on hover, solid Ink with white text when current; the Alerts link carries an orange unread count.
- **Tabs:** the same pills inside a white rail (1.4rem radius, Resting shadow); the active tab's count turns orange.
- **Mobile:** one row with an ink Menu pill; the menu opens inside the bar.

### Role hero banner (signature)
White 2rem banner: wide Display headline whose last line is Deep Orange, one sentence, primary pill CTA (with arrow) plus an optional secondary pill, an isometric role scene on the right with a Caveat note pinned to a corner, and a divided stats strip of live counts below. Exactly one stat per role is orange (the count that needs action now); red and amber tones are available for stuck counts. Stats are live counts only.

### Pipeline road (signature)
The shipment's progress as a 12px ink road with orange lane dashes and six stops (18px circles with a 2px ink border): done stops white with a tick, the current stop orange (red or amber when stuck), future stops Crate Grey. A small drawn van drives from the previous stop to the current one once (1.1s). Labels below at 11px; the status line under it in severity colours.

### Timeline tracker
Day-grouped event list on a 1px Seam spine with 32px dots: the seller in orange, other people in ink, automatic updates white. Role chips sit beside the actor name.

### Isometric illustration kit
Prisms with left/right/top fills and face decals (doors, stripes, windows), drawn back-to-front. Palette per material: kraft cartons, white walls, ink roofs and road, orange doors and van stripe, wood pallets, concrete pads, with a 4.5% ink ellipse as ground shadow. Four role scenes plus the van, depot, conveyor, pallet, road and tree parts.

### Moments
Milestone toasts in an ink card (Overlay shadow) bottom-right, rising in and fading after about 2.7s: boxes drop into a van on submit, a round orange CLEARED customs stamp thumps down on Cleared, a green parcel pops on Delivered.

### Motion
Arrival motion plays once then rests: the hero van drives in (1.8s, cubic-bezier(0.16, 1, 0.3, 1)), the conveyor belt runs twice, a parcel bobs once, the road van drives once, a ping pulses twice. Under `prefers-reduced-motion` every animation and transition collapses to 1ms and the hero van does not move.

## Do's and Don'ts

### Do:
- **Do** set pages on Depot Floor with white 1.75rem cards and the Resting shadow.
- **Do** give each role home page one orange headline line, one orange primary CTA and one orange act-now count, and no more.
- **Do** make every clickable control a pill; current state is solid Ink with white text.
- **Do** keep links ink with an orange 2px underline on hover and focus.
- **Do** draw illustrations from the isometric kit (ink stroke, ink/white/kraft/orange fills); keep them decorative and `aria-hidden`.
- **Do** let motion play once and rest, and honour reduced motion.
- **Do** show only live counts in stats.

### Don't:
- **Don't** use orange for severity, body text or link text, or to decorate a whole surface.
- **Don't** restyle RED / AMBER / GREEN; they keep Tailwind's stock values.
- **Don't** use blue links or a grey SaaS admin palette.
- **Don't** use the 125% wide cut below headline level (buttons, tables, nav, forms).
- **Don't** use hard offset shadows; depth is soft and ink-tinted.
- **Don't** use rendered 3D or photographic imagery; the world is drawn.
- **Don't** loop ambient animation on working screens.
- **Don't** place uppercase labels above headlines as kickers; the label style is for table heads and field groups.
