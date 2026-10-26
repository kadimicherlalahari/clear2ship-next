// Gemini only READS text and documents into fields, and explains results in plain words.
// It never decides a rule, picks a carrier or changes a number. Every call has a guard in code.
import { GoogleGenAI, Type, type Schema } from "@google/genai";
import { DOC_FIELDS } from "./rules/docs";
import type { CheckResult, DocKind, ExtractedDoc } from "./rules/types";

export class GeminiUnavailable extends Error {}

function client() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new GeminiUnavailable("GEMINI_API_KEY is not set");
  return new GoogleGenAI({ apiKey, httpOptions: { timeout: Number(process.env.GEMINI_TIMEOUT_MS ?? 20000) } });
}

const model = () => process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

/** Google answers "busy" (429/503) or times out (504) at peak times; those are worth a quick second try. */
function transient(e: unknown) {
  const m = e instanceof Error ? e.message : String(e);
  return /"code":\s*(429|500|503|504)|UNAVAILABLE|DEADLINE_EXCEEDED|RESOURCE_EXHAUSTED|timed? ?out|aborted|fetch failed|ECONNRESET/i.test(m);
}

async function generateJson<T>(contents: Parameters<GoogleGenAI["models"]["generateContent"]>[0]["contents"], schema: Schema, system: string): Promise<T> {
  const attempts = 3;
  for (let i = 1; ; i++) {
    try {
      const res = await client().models.generateContent({
        model: model(),
        contents,
        config: { systemInstruction: system, responseMimeType: "application/json", responseSchema: schema, temperature: 0 },
      });
      return JSON.parse(res.text ?? "{}") as T;
    } catch (e) {
      if (e instanceof GeminiUnavailable) throw e;
      if (i < attempts && transient(e)) { await new Promise((r) => setTimeout(r, 800 * i)); continue; }
      throw new GeminiUnavailable(e instanceof Error ? e.message.slice(0, 300) : String(e));
    }
  }
}

const NO_GUESS = `Rules you must follow:
- Only return values that are written in the input. If something is not stated, return null. Never guess, infer, calculate or fill in a typical value.
- For every value you return, put the exact words it came from in "source" (copied character for character).
- Do not convert or round numbers. Copy them as written (e.g. "£5,400", "620 kg").`;

const field = (description: string): Schema => ({
  type: Type.OBJECT,
  description,
  properties: { value: { type: Type.STRING, nullable: true }, source: { type: Type.STRING, nullable: true } },
  required: ["value", "source"],
});

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** Keep only fields whose source words really appear in the text. Anything else becomes null. */
function guardFields(obj: Record<string, { value: string | null; source: string | null } | undefined>, text: string) {
  const hay = norm(text);
  const out: Record<string, { value: string; source: string }> = {};
  for (const [k, f] of Object.entries(obj)) {
    if (!f || f.value === null || f.value === undefined || String(f.value).trim() === "") continue;
    if (!f.source || !hay.includes(norm(f.source))) continue;
    // A priority must be said in words ("cheapest", "most reliable"…), not read into a deadline like "7 days max".
    if (k === "seller_priority" && !norm(f.source).includes(norm(String(f.value)).replace(/^most /, "").slice(0, 4))) continue;
    out[k] = { value: String(f.value), source: f.source };
  }
  return out;
}

// ---------------------------------------------------------------- chat message → field updates

export const CHAT_BOOKING_FIELDS = [
  "seller_name", "origin_city", "destination_city", "destination_country", "destination_type",
  "ready_date", "seller_priority", "pallets", "cartons", "declared_value", "gross_weight_kg",
  "appointment_booked", "preferred_carrier",
] as const;
export const CHAT_ITEM_FIELDS = [
  "sku", "description", "hs_code", "quantity", "units_per_carton", "cartons", "unit_price",
  "unit_weight_kg", "country_of_origin",
] as const;

export type ChatExtraction = {
  booking: Record<string, { value: string; source: string }>;
  items: Record<string, { value: string; source: string }>[];
  unknown: string[]; // fields the seller said they don't know
};

const chatSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    booking: {
      type: Type.OBJECT,
      properties: Object.fromEntries(CHAT_BOOKING_FIELDS.map((f) => [f, field(f)])),
    },
    items: {
      type: Type.ARRAY,
      items: { type: Type.OBJECT, properties: Object.fromEntries(CHAT_ITEM_FIELDS.map((f) => [f, field(f)])) },
    },
    unknown_fields: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["booking", "items", "unknown_fields"],
};

export async function extractFromChat(message: string, lastQuestion: string | null, knownSkus: string[]): Promise<ChatExtraction> {
  const system = `You read a seller's chat message about an export shipment and return the shipment details it states.
${NO_GUESS}
- "source" must be copied from the SELLER MESSAGE only, never from the app's question.
- Booking fields: seller_name, origin_city, destination_city, destination_country, destination_type ("Warehouse" or "Business address"),
  ready_date (as written), seller_priority (Cheapest/Fastest/Most reliable/Balanced, only if the seller says it), pallets, cartons (total for the shipment),
  declared_value (total value), gross_weight_kg, appointment_booked ("Yes"/"No", delivery slot at the warehouse), preferred_carrier.
- Items: one entry per product mentioned, with sku, description, hs_code, quantity (units), units_per_carton, cartons (for that item), unit_price, unit_weight_kg, country_of_origin.
  If the message changes an existing item, include its sku. Existing SKUs: ${knownSkus.join(", ") || "none"}.
- unknown_fields: names of fields the seller explicitly says they don't know or don't have (e.g. "I don't know the HS code" → ["hs_code"]). Otherwise [].
- If the seller answers the app's question with bare values (e.g. "3, 90"), map them in the order the question asked for them.`;
  const contents = `APP'S LAST QUESTION: ${lastQuestion ?? "(none)"}\n\nSELLER MESSAGE:\n${message}`;
  const raw = await generateJson<{
    booking?: Record<string, { value: string | null; source: string | null }>;
    items?: Record<string, { value: string | null; source: string | null }>[];
    unknown_fields?: string[];
  }>(contents, chatSchema, system);
  return {
    booking: guardFields(raw.booking ?? {}, message),
    items: (raw.items ?? []).map((it) => guardFields(it, message)).filter((it) => Object.keys(it).length > 0),
    unknown: (raw.unknown_fields ?? []).filter((f) => ([...CHAT_BOOKING_FIELDS, ...CHAT_ITEM_FIELDS] as readonly string[]).includes(f)),
  };
}

// ---------------------------------------------------------------- documents → fields


export async function extractDocument(kind: DocKind, data: Buffer, mimeType: string): Promise<ExtractedDoc> {
  const spec = DOC_FIELDS[kind];
  const schema: Schema = {
    type: Type.OBJECT,
    properties: {
      ...Object.fromEntries(spec.totals.map((f) => [f, field(f)])),
      items: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: Object.fromEntries(spec.item.map((f) => [f, field(f)])) } },
    },
    required: [...spec.totals, "items"],
  };
  const label = kind === "commercial_invoice" ? "commercial invoice" : "packing list";
  const system = `You read a ${label} for an export shipment and return its fields.\n${NO_GUESS}\n- Do not add up lines to make a total: only return a total if the document prints it.`;
  const isText = mimeType.startsWith("text/") || mimeType === "application/json";
  const contents = isText
    ? [{ text: `${label.toUpperCase()}:\n${data.toString("utf8")}` }]
    : [{ inlineData: { mimeType, data: data.toString("base64") } }, { text: `Read this ${label}.` }];
  const raw = await generateJson<Record<string, unknown>>(contents, schema, system);

  // Guard: for text documents we can check every source; for PDFs/images the seller reviews each value.
  const clean = (o: Record<string, { value: string | null; source: string | null }>) => {
    const out: Record<string, { value: string | null; source: string | null }> = {};
    for (const [k, f] of Object.entries(o)) {
      const ok = f && f.value !== null && String(f.value).trim() !== "" && (!isText || (f.source && norm(data.toString("utf8")).includes(norm(f.source))));
      out[k] = ok ? { value: String(f.value), source: f.source } : { value: null, source: null };
    }
    return out;
  };
  const { items, ...totals } = raw as { items?: Record<string, { value: string | null; source: string | null }>[] };
  return { ...clean(totals as Record<string, { value: string | null; source: string | null }>), items: (items ?? []).map(clean) } as ExtractedDoc;
}

// ---------------------------------------------------------------- customs email → suggested status

export type CustomsSuggestion = {
  status: "Cleared" | "On hold" | "Rejected" | null;
  reason: string | null;           // exact words from the email, or null if not found
  reasonFoundInEmail: boolean;
  next_steps: string | null;
  responsible: "seller" | "warehouse" | "forwarder" | "admin" | null;
};

export async function readCustomsEmail(text: string): Promise<CustomsSuggestion> {
  const schema: Schema = {
    type: Type.OBJECT,
    properties: {
      status: { type: Type.STRING, enum: ["Cleared", "On hold", "Rejected"], nullable: true },
      reason_exact_words: { type: Type.STRING, nullable: true },
      next_steps: { type: Type.STRING, nullable: true },
      responsible: { type: Type.STRING, enum: ["seller", "warehouse", "forwarder", "admin"], nullable: true },
    },
    required: ["status", "reason_exact_words", "next_steps", "responsible"],
  };
  const system = `You read an email from customs or a freight forwarder about one shipment.
- status: "Cleared", "On hold" or "Rejected" only if the email clearly says so; otherwise null.
- reason_exact_words: copy the sentence(s) giving the reason, character for character. Do not reword. null if no reason is given.
- next_steps: what the email asks someone to do, in short plain words. Only what the email says; null if nothing.
- responsible: who has to act according to the email (seller = the exporter/shipper/supplier documents, warehouse, forwarder, admin). null if unclear.`;
  const raw = await generateJson<{ status: CustomsSuggestion["status"]; reason_exact_words: string | null; next_steps: string | null; responsible: CustomsSuggestion["responsible"] }>(
    `EMAIL:\n${text}`, schema, system);
  const found = !!raw.reason_exact_words && norm(text).includes(norm(raw.reason_exact_words));
  return {
    status: raw.status ?? null,
    reason: found ? raw.reason_exact_words : null,
    reasonFoundInEmail: found,
    next_steps: raw.next_steps ?? null,
    responsible: raw.responsible ?? null,
  };
}

// ---------------------------------------------------------------- plain-words summary of a code result

/** Short friendly summary of a result made by code. Discarded if it mentions any number code didn't produce. */
export async function explainResult(result: CheckResult): Promise<string | null> {
  const facts = {
    headline: result.headline,
    issues: result.issues.map((i) => ({ rule: i.code, level: i.kind, problem: i.message, fix: i.fix, who: i.owner })),
    notes: result.notes,
    carrier: result.carrier && {
      pick: result.carrier.pick, reason: result.carrier.reason, removed: result.carrier.removed,
      others: result.carrier.alternatives.map((a) => ({ name: a.name, price: a.price, days: a.transitDays, onTime: a.onTimePct })),
    },
  };
  const schema: Schema = { type: Type.OBJECT, properties: { summary: { type: Type.STRING } }, required: ["summary"] };
  const system = `Explain this shipment check result to a small business seller in 2-4 short, friendly sentences.
Use only the facts given. Do not change any number, rule result or carrier. Do not add advice that isn't in the facts.
Never say the shipment is "compliant", "cleared" or "booked".`;
  try {
    const { summary } = await generateJson<{ summary: string }>(JSON.stringify(facts), schema, system);
    const allowed = new Set((JSON.stringify(facts).match(/\d+(?:[.,]\d+)*/g) ?? []).map((n) => n.replace(/,/g, "")));
    const used = (summary.match(/\d+(?:[.,]\d+)*/g) ?? []).map((n) => n.replace(/,/g, ""));
    if (used.some((n) => !allowed.has(n))) return null;
    if (/\b(compliant|cleared|booked)\b/i.test(summary)) return null;
    return summary;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- questions about one shipment

/** Answer a seller's question using only the shipment facts code gives it. Null if it can't (or breaks the guard). */
export async function answerAboutShipment(question: string, facts: object): Promise<string | null> {
  const schema: Schema = { type: Type.OBJECT, properties: { answer: { type: Type.STRING } }, required: ["answer"] };
  const system = `You answer a seller's question about ONE export shipment, in 1-3 short, friendly sentences.
Use only the FACTS. If the facts don't contain the answer, say you don't have that information and suggest who to ask.
Never invent dates, prices, references or statuses. Never say the shipment is "compliant".
Only say something is booked or confirmed if the facts say it was confirmed by the carrier or warehouse.`;
  try {
    const factsText = JSON.stringify(facts);
    const { answer } = await generateJson<{ answer: string }>(`FACTS:\n${factsText}\n\nQUESTION:\n${question}`, schema, system);
    const allowed = new Set((`${factsText} ${question}`.match(/\d+(?:[.,]\d+)*/g) ?? []).map((n) => n.replace(/,/g, "")));
    const used = (answer.match(/\d+(?:[.,]\d+)*/g) ?? []).map((n) => n.replace(/,/g, ""));
    if (used.some((n) => !allowed.has(n)) || /\bcompliant\b/i.test(answer)) return null;
    return answer;
  } catch {
    return null;
  }
}
