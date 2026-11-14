import Anthropic from "@anthropic-ai/sdk";
import { DETAIL_FIELDS } from "../details";
import type { FetchedPage } from "./fetch";
import type { Candidate, EnrichField } from "./types";
import { MAX_QUOTE } from "./util";

/**
 * Optional LLM extraction (only when ANTHROPIC_API_KEY is set).
 * The model must return, for each fact, a verbatim quote from the page. Nothing
 * it returns is trusted: every value still goes through verify.ts, which drops
 * any quote that isn't on the page and any value the quote doesn't support.
 */
export const LLM_MODEL = "claude-haiku-5-5";
/** Upper bound on page text sent per call (cost control); pages are rarely longer. */
const MAX_PAGE_CHARS = 60_000;

const RECORD_FIELDS: { key: EnrichField; help: string }[] = [
  { key: "phone", help: "Main phone number for this service (not fax, not a crisis line unless that is the service)." },
  { key: "email", help: "Contact email for this service." },
  { key: "address", help: "Street address where people go for this service." },
  { key: "hoursText", help: "Regular weekly opening hours for this service, e.g. 'Mon–Fri 9am–5pm'." },
  { key: "eligibility", help: "Who can use it / what to bring (one or two sentences)." },
  { key: "access", help: "How to access it / where to go (one or two sentences)." },
];

export const LLM_FIELDS: { key: string; help: string; kind: string }[] = [
  ...RECORD_FIELDS.map((f) => ({ key: f.key, help: f.help, kind: "text" })),
  ...DETAIL_FIELDS.map((f) => ({ key: `details.${f.key}`, help: f.help, kind: f.kind })),
];

const SYSTEM = `You extract facts about one social service from the text of its web page, for outreach volunteers who help people experiencing homelessness in Boulder, Colorado.

Accuracy matters more than coverage. A wrong fact can send someone across town to a closed door.

Rules:
- Only report a fact if the page states it explicitly about the named service. Omit anything implied, typical, or that you would have to infer.
- If the page covers several programs or locations and it is unclear which one a fact belongs to, omit it.
- For every fact, "quote" must be copied character-for-character from the page text: a short contiguous snippet (under ${MAX_QUOTE} characters) that by itself proves the value. Do not paraphrase, join separate passages, or fix typos in the quote.
- "value" is your concise statement of the fact in plain words. For yes/no fields answer exactly "yes" or "no". For list fields give a comma-separated list.
- Report each field at most once. Returning no facts is a good answer when the page says little.`;

const SCHEMA = {
  type: "object",
  properties: {
    facts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          field: { type: "string", enum: LLM_FIELDS.map((f) => f.key) },
          value: { type: "string" },
          quote: { type: "string" },
        },
        required: ["field", "value", "quote"],
        additionalProperties: false,
      },
    },
  },
  required: ["facts"],
  additionalProperties: false,
} as const;

export type LlmClient = Pick<Anthropic, "messages">;

export function llmEnabled() {
  return !!process.env.ANTHROPIC_API_KEY;
}

export async function extractWithLlm(
  page: FetchedPage,
  svc: { name: string; organization?: string | null },
  opts: { client?: LlmClient; log?: (s: string) => void } = {},
): Promise<{ candidates: Candidate[]; usage?: { input: number; output: number }; error?: string }> {
  if (!opts.client && !llmEnabled()) return { candidates: [] };
  const client = opts.client ?? new Anthropic();
  const fieldList = LLM_FIELDS.map((f) => `- ${f.key} (${f.kind}): ${f.help}`).join("\n");
  const text = page.text.slice(0, MAX_PAGE_CHARS);
  try {
    const res = await client.messages.create({
      model: LLM_MODEL,
      max_tokens: 16000,
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA as unknown as Record<string, unknown> } },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `Service: ${svc.name}${svc.organization ? ` (run by ${svc.organization})` : ""}\nPage: ${page.url}\n\nFields you may report:\n${fieldList}\n\n<page_text>\n${text}\n</page_text>`,
        },
      ],
    });
    const usage = { input: res.usage.input_tokens, output: res.usage.output_tokens };
    if (res.stop_reason === "refusal" || res.stop_reason === "max_tokens") return { candidates: [], usage, error: `stop_reason=${res.stop_reason}` };
    const block = res.content.find((b): b is Anthropic.TextBlock => b.type === "text");
    if (!block) return { candidates: [], usage };
    const parsed = JSON.parse(block.text) as { facts?: { field: string; value: string; quote: string }[] };
    const seen = new Set<string>();
    const candidates: Candidate[] = [];
    for (const f of parsed.facts ?? []) {
      if (!f?.field || !f.value?.trim() || !f.quote?.trim() || seen.has(f.field)) continue;
      if (!LLM_FIELDS.some((x) => x.key === f.field)) continue;
      seen.add(f.field);
      candidates.push({ field: f.field as EnrichField, value: f.value.trim(), evidence: { url: page.url, quote: f.quote.slice(0, MAX_QUOTE), method: "llm" } });
    }
    return { candidates, usage };
  } catch (e) {
    const msg =
      e instanceof Anthropic.RateLimitError ? "rate limited" : e instanceof Anthropic.APIError ? `API error ${e.status}: ${e.message}` : e instanceof SyntaxError ? "unparseable model output" : String((e as Error).message ?? e);
    opts.log?.(`  llm: ${msg}`);
    return { candidates: [], error: msg.slice(0, 300) };
  }
}
