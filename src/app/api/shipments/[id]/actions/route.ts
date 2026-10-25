import { currentActor, handler, HttpError, requireRole } from "@/lib/api";
import {
  acknowledgeIssue, answerProposedSlot, appointmentRespond, carrierRespond, changePriority, correctReadValue, fixIssue, requestNewSlot,
  resendCarrierRequest, resubmitDeclaration, saveDocDetails, selectCarrier,
} from "@/lib/workflow";

/** Smaller shipment actions in one place: { action, ...fields }. Each checks who may do it. */
export const POST = handler(async (req, { id }) => {
  const actor = await currentActor();
  const body = await req.json();
  switch (body.action) {
    case "fix":
      requireRole(actor, "seller", "admin");
      await fixIssue(id, String(body.issueKey), body.values ?? [], actor);
      break;
    case "correct-read":
      requireRole(actor, "seller", "admin");
      await correctReadValue(id, String(body.issueKey), body.value, actor);
      break;
    case "acknowledge":
      requireRole(actor, "seller", "admin");
      await acknowledgeIssue(id, String(body.issueKey), actor);
      break;
    case "select-carrier":
      requireRole(actor, "seller", "admin");
      await selectCarrier(id, String(body.carrier), actor);
      break;
    case "priority":
      requireRole(actor, "seller", "admin");
      await changePriority(id, String(body.priority ?? ""), actor);
      break;
    case "resend-carrier":
      requireRole(actor, "seller", "admin");
      await resendCarrierRequest(id, actor);
      break;
    case "carrier-response":
      requireRole(actor, "carrier", "admin");
      await carrierRespond(id, body, actor);
      break;
    case "appointment-response":
      requireRole(actor, "warehouse", "admin");
      await appointmentRespond(id, body, actor);
      break;
    case "request-slot":
      requireRole(actor, "seller", "admin");
      await requestNewSlot(id, actor);
      break;
    case "answer-slot":
      requireRole(actor, "seller", "admin");
      await answerProposedSlot(id, body.accept === true, actor);
      break;
    case "resubmit":
      requireRole(actor, "forwarder");
      await resubmitDeclaration(id, String(body.ref ?? ""), String(body.date ?? ""), actor);
      break;
    case "doc-details":
      requireRole(actor, "seller", "admin");
      return saveDocDetails(id, body.values ?? [], actor);
    default:
      throw new HttpError(400, "Unknown action.");
  }
  return { ok: true };
});
