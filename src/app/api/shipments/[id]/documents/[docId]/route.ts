import { currentActor, handler, requireRole } from "@/lib/api";
import type { ExtractedDoc } from "@/lib/rules/types";
import { confirmDocument } from "@/lib/workflow";

/** Seller confirms (and may correct) the fields read from a document. */
export const PUT = handler(async (req, { id, docId }) => {
  const actor = await currentActor();
  requireRole(actor, "seller", "admin");
  const { extracted } = (await req.json()) as { extracted: ExtractedDoc };
  await confirmDocument(id, Number(docId), extracted, actor);
  return { ok: true };
});
