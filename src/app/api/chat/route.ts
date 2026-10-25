import { currentActor, handler, HttpError, requireRole } from "@/lib/api";
import { handleChatMessage } from "@/lib/chat";

export const POST = handler(async (req) => {
  const actor = await currentActor();
  requireRole(actor, "seller", "admin");
  const { shipmentId, message } = (await req.json()) as { shipmentId?: string | null; message: string };
  if (!message?.trim()) throw new HttpError(400, "Please type a message.");
  if (message.length > 4000) throw new HttpError(400, "That message is too long. Please keep it under 4,000 characters.");
  return handleChatMessage(shipmentId || null, message.trim(), actor);
});
