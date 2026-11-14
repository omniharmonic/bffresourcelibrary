import { createHash } from "node:crypto";
import { redact } from "../redact";

/**
 * TypeSafe Jev (System One) — typed classification, not text generation.
 * We ask one yes/no ("noul") question per category, so the model can only
 * point at categories we already have. Docs: https://docs.typesafe.ai/api/system-one
 */
const ENDPOINT = "https://api.typesafe.ai/v1/systemone";

export type JevResult = {
  categories: Record<string, number>;
  crisis: number;
  urgency?: string;
  language?: string;
  model?: string;
};

type Cat = { slug: string; name: string; description?: string | null };
const cache = new Map<string, { at: number; value: JevResult }>();

export async function classifyNeeds(text: string, cats: Cat[], opts: { timeoutMs?: number; fetchImpl?: typeof fetch } = {}): Promise<JevResult | null> {
  const key = process.env.TYPESAFE_API_KEY;
  if (!key || !text.trim()) return null;
  const state = redact(text).slice(0, 4000);
  const hash = createHash("sha256").update(state).digest("hex");
  const hit = cache.get(hash);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.value;

  const questions: Record<string, unknown> = {
    crisis: {
      type: "noul",
      instructions: "Is the person describing an immediate risk to life or safety: suicidal thoughts, overdose, a medical emergency, or violence happening to them?",
    },
    urgency: {
      type: "choice",
      instructions: "How soon does the person most need help?",
      criteria: { today: "They need something today or right now", soon: "Within the next few days or weeks", long_term: "Longer-term stability like housing, work or benefits" },
    },
    language: {
      type: "choice",
      instructions: "What language is the text mostly written in?",
      criteria: { en: "English", es: "Spanish", other: "Another language" },
    },
  };
  for (const c of cats) {
    questions[`cat__${c.slug}`] = {
      type: "noul",
      instructions: `Someone experiencing homelessness in Boulder, Colorado described their situation. Would "${c.name}" help with something they need or mention? ${c.description ?? ""}`.trim(),
    };
  }

  try {
    const res = await (opts.fetchImpl ?? fetch)(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "jev-latest", state, questions }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 4000),
    });
    if (!res.ok) {
      console.error("[jev] HTTP", res.status, (await res.text()).slice(0, 300));
      return null;
    }
    const body = (await res.json()) as { model?: string; answers?: Record<string, Record<string, unknown>> };
    const answers = body.answers ?? {};
    const categories: Record<string, number> = {};
    for (const [k, v] of Object.entries(answers)) {
      if (k.startsWith("cat__") && typeof v.noul === "number") categories[k.slice(5)] = v.noul;
    }
    const value: JevResult = {
      categories,
      crisis: typeof answers.crisis?.noul === "number" ? (answers.crisis.noul as number) : 0,
      urgency: answers.urgency?.choice as string | undefined,
      language: answers.language?.choice as string | undefined,
      model: body.model,
    };
    cache.set(hash, { at: Date.now(), value });
    return value;
  } catch (e) {
    console.error("[jev] failed, falling back to lexicon:", (e as Error).message);
    return null;
  }
}
