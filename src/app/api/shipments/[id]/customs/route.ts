import { currentActor, handler, requireRole } from "@/lib/api";
import { pasteCustomsEmail } from "@/lib/workflow";

// Gemini can be slow at busy times; leave room to try the backup models.
export const maxDuration = 120;

export const POST = handler(async (req, { id }) => {
  const actor = await currentActor();
  requireRole(actor, "forwarder", "admin");
  const { text } = (await req.json()) as { text: string };
  return pasteCustomsEmail(id, text ?? "", actor);
});
