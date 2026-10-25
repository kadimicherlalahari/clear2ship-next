import { currentActor, handler, HttpError, requireRole } from "@/lib/api";
import { q } from "@/lib/db";
import { parseBookingsWorkbook } from "@/lib/excel";
import { createShipment, logEvent, recheck, runAllChecks, getShipment, storeBooking } from "@/lib/shipments";

/** Excel upload: every booking is checked with the same rules (no AI) and saved as a Draft. */
export const POST = handler(async (req) => {
  const actor = await currentActor();
  requireRole(actor, "seller", "admin");
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "Please choose an Excel file.");
  if (!/\.xlsx$/i.test(file.name)) throw new HttpError(400, "Please upload an .xlsx file in the Clear2Ship template format.");
  let parsed;
  try {
    parsed = await parseBookingsWorkbook(await file.arrayBuffer());
  } catch {
    throw new HttpError(400, "We couldn't open that file. Please upload an .xlsx file in the Clear2Ship template format.");
  }
  if (parsed.errors.length && !parsed.bookings.length) return { results: [], warnings: parsed.warnings, errors: parsed.errors };

  const results = [];
  for (const raw of parsed.bookings) {
    const id = String(raw.id);
    const [existing] = await q("SELECT status FROM shipments WHERE id = $1", [id]);
    if (existing && existing.status !== "Draft") {
      results.push({ id, skipped: `Booking ${id} already exists and has been submitted (${existing.status}), so it wasn't changed.` });
      continue;
    }
    if (existing) {
      await storeBooking(id, raw);
      await logEvent(id, actor, `Replaced from Excel upload (${file.name})`);
    } else {
      await createShipment(actor, raw);
      await logEvent(id, actor, `Imported from Excel upload (${file.name})`);
    }
    await recheck(id, actor);
    const check = runAllChecks((await getShipment(id))!);
    results.push({
      id, overall: check.overall, headline: check.headline, issues: check.issues, notes: check.notes,
      carrier: check.carrier, docIssues: check.docIssues, disclaimer: check.disclaimer,
    });
  }
  return { results, warnings: parsed.warnings, errors: parsed.errors };
});
