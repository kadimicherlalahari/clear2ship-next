import { currentActor, handler, HttpError, requireRole } from "@/lib/api";
import type { DocKind } from "@/lib/rules/types";
import { uploadDocument } from "@/lib/workflow";

// Gemini can be slow at busy times; leave room to try the backup models.
export const maxDuration = 120;

export const POST = handler(async (req, { id }) => {
  const actor = await currentActor();
  requireRole(actor, "seller", "admin");
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "Please choose a file.");
  return uploadDocument(id, String(form.get("kind")) as DocKind, file, actor);
});
