import { handler, HttpError } from "@/lib/api";
import { q } from "@/lib/db";

export const GET = handler(async (_req, { id, docId }) => {
  const [doc] = await q("SELECT filename, mime_type, content FROM documents WHERE id = $1 AND shipment_id = $2", [Number(docId), id]);
  if (!doc) throw new HttpError(404, "Document not found.");
  if (!doc.content) throw new HttpError(404, "This sample document has no file attached.");
  const bytes = typeof doc.content === "string" ? Buffer.from(doc.content.replace(/^\\x/, ""), "hex") : Buffer.from(doc.content);
  return new Response(bytes, {
    headers: { "Content-Type": doc.mime_type, "Content-Disposition": `inline; filename="${encodeURIComponent(doc.filename)}"` },
  });
});
