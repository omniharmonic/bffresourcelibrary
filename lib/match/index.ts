import { editDistance, tokens } from "../text";
import { openStatus } from "../hours";
import type { ScheduleSpan } from "../db/schema";

export type Term = { phrase: string; categorySlug: string; weight: number };
export type CategoryInfo = { slug: string; name: string; tier: number; dimensionSlug: string };
export type MatchService = {
  id: string;
  name: string;
  summary?: string | null;
  access?: string | null;
  fieldNotes?: string | null;
  organization?: string | null;
  categories: string[];
  preferred: boolean;
  status: string;
  verifiedAt?: Date | string | null;
  schedule?: ScheduleSpan[] | null;
  petPolicy?: string | null;
  eligibility?: string | null;
  startsAt?: Date | string | null;
  endsAt?: Date | string | null;
};

export type CompiledTerm = Term & { toks: string[] };
export type CategoryScore = { slug: string; score: number; reasons: string[] };

const NEGATORS = [["dont", "need"], ["do", "not", "need"], ["dont", "want"], ["not"], ["already", "have"], ["no", "longer"], ["never"]];
const STOP = new Set(
  "i me my im a an the and or but to of in on at for with is am are was be been it its this that have has had do does did can could would should will just so some any get got need needs want help please really very like also too from about there here they them he she we you your our".split(" "),
);

export function compileTerms(terms: Term[]): CompiledTerm[] {
  return terms
    .map((t) => ({ ...t, toks: tokens(t.phrase) }))
    .filter((t) => t.toks.length > 0);
}

function negatedBefore(toks: string[], start: number): boolean {
  const window = toks.slice(Math.max(0, start - 3), start);
  return NEGATORS.some((neg) => {
    for (let i = 0; i + neg.length <= window.length; i++) {
      if (neg.every((w, j) => window[i + j] === w)) return true;
    }
    return false;
  });
}

/** Find phrase tokens in text tokens allowing one filler token between words. Returns start index or -1. */
function findPhrase(text: string[], phrase: string[], fuzzy: boolean): number {
  for (let i = 0; i < text.length; i++) {
    const firstOk =
      text[i] === phrase[0] ||
      (fuzzy && phrase.length === 1 && phrase[0].length >= 5 && text[i].length >= 5 && editDistance(text[i], phrase[0], 1) <= 1);
    if (!firstOk) continue;
    let pos = i, ok = true;
    for (let k = 1; k < phrase.length; k++) {
      if (text[pos + 1] === phrase[k]) pos += 1;
      else if (text[pos + 2] === phrase[k]) pos += 2;
      else { ok = false; break; }
    }
    if (ok) return i;
  }
  return -1;
}

export function scoreCategories(text: string, terms: CompiledTerm[], opts: { fuzzy?: boolean } = {}): CategoryScore[] {
  const toks = tokens(text);
  if (!toks.length) return [];
  const acc = new Map<string, { miss: number; reasons: Set<string> }>();
  for (const t of terms) {
    const at = findPhrase(toks, t.toks, opts.fuzzy ?? true);
    if (at < 0 || negatedBefore(toks, at)) continue;
    const e = acc.get(t.categorySlug) ?? { miss: 1, reasons: new Set<string>() };
    e.miss *= 1 - Math.min(Math.max(t.weight, 0), 0.99);
    e.reasons.add(t.phrase);
    acc.set(t.categorySlug, e);
  }
  return [...acc.entries()]
    .map(([slug, e]) => ({ slug, score: +(1 - e.miss).toFixed(3), reasons: [...e.reasons].slice(0, 4) }))
    .sort((a, b) => b.score - a.score);
}

/** Merge AI probabilities (0..1 per category) into lexicon scores. AI can boost but never invent services. */
export function mergeAi(lex: CategoryScore[], ai: Record<string, number>, threshold = 0.5): CategoryScore[] {
  const map = new Map(lex.map((c) => [c.slug, { ...c, reasons: [...c.reasons] }]));
  for (const [slug, p] of Object.entries(ai)) {
    if (p < threshold) continue;
    const cur = map.get(slug);
    if (cur) cur.score = +Math.max(cur.score, 0.6 * cur.score + 0.4 * p).toFixed(3);
    else map.set(slug, { slug, score: +(0.85 * p).toFixed(3), reasons: ["suggested by AI assist"] });
  }
  return [...map.values()].sort((a, b) => b.score - a.score);
}

export type Filters = { petsOk?: boolean; noIdNeeded?: boolean; openToday?: boolean; includeUnverified?: boolean };

export type RankedService = {
  service: MatchService;
  tier: number;
  categorySlug: string;
  score: number;
  reasons: string[];
  open: ReturnType<typeof openStatus>;
};

const DAY_MS = 86_400_000;

function isLive(s: MatchService, now: Date, includeUnverified: boolean): boolean {
  if (s.status === "inactive") return false;
  if (s.status === "unverified" && !includeUnverified) return false;
  if (s.endsAt && new Date(s.endsAt).getTime() < now.getTime()) return false;
  if (s.startsAt && new Date(s.startsAt).getTime() - now.getTime() > 14 * DAY_MS) return false;
  return true;
}

export function rankServices(
  services: MatchService[],
  cats: CategoryScore[],
  catInfo: Map<string, CategoryInfo>,
  filters: Filters = {},
  now = new Date(),
): RankedService[] {
  const catScore = new Map(cats.map((c) => [c.slug, c]));
  const out: RankedService[] = [];
  for (const s of services) {
    if (!isLive(s, now, !!filters.includeUnverified)) continue;
    if (filters.petsOk && !/(yes|ok|allowed|welcome|friendly|si)/i.test(s.petPolicy ?? "")) continue;
    if (filters.noIdNeeded && /\b(id required|photo id|must (show|have) id)\b/i.test(s.eligibility ?? "")) continue;
    let best: { slug: string; score: number; reasons: string[] } | null = null;
    for (const slug of s.categories) {
      const c = catScore.get(slug);
      if (c && (!best || c.score > best.score)) best = c;
    }
    if (!best) continue;
    const open = openStatus(s.schedule, now);
    if (filters.openToday && !(open.state === "open" || open.state === "later-today" || open.state === "unknown")) continue;
    const verifiedRecent = s.verifiedAt ? now.getTime() - new Date(s.verifiedAt).getTime() < 120 * DAY_MS : false;
    const openSoon = open.state === "open" || (open.state === "later-today" && open.minutesUntil < 240);
    const score =
      best.score * (1 + (s.preferred ? 0.25 : 0) + (openSoon ? 0.15 : 0) + (verifiedRecent ? 0.1 : 0)) -
      (s.status === "unverified" ? 0.3 : 0);
    out.push({
      service: s,
      tier: catInfo.get(best.slug)?.tier ?? 2,
      categorySlug: best.slug,
      score: +score.toFixed(3),
      reasons: best.reasons,
      open,
    });
  }
  return out.sort((a, b) => b.score - a.score || a.service.name.localeCompare(b.service.name));
}

/** Plain keyword search across service text — the fallback when no category matched well. */
export function textSearch(services: MatchService[], query: string, now = new Date()): RankedService[] {
  const q = tokens(query).filter((t) => !STOP.has(t) && t.length > 1);
  if (!q.length) return [];
  const out: RankedService[] = [];
  for (const s of services) {
    if (!isLive(s, now, true)) continue;
    const hay = new Set(tokens([s.name, s.organization, s.summary, s.access, s.fieldNotes].filter(Boolean).join(" ")));
    const nameToks = new Set(tokens(s.name));
    let hit = 0;
    for (const t of q) if (hay.has(t)) hit += nameToks.has(t) ? 2 : 1;
    if (!hit) continue;
    out.push({
      service: s,
      tier: 2,
      categorySlug: s.categories[0] ?? "",
      score: +(hit / (q.length * 2)).toFixed(3),
      reasons: ["keyword match"],
      open: openStatus(s.schedule, now),
    });
  }
  return out.sort((a, b) => b.score - a.score);
}

export type MatchResult = {
  categories: CategoryScore[];
  results: RankedService[];
  byTier: Record<1 | 2 | 3, RankedService[]>;
  usedFallback: boolean;
};

export function match(
  input: { text: string; chips?: string[]; ai?: Record<string, number> | null; filters?: Filters },
  data: { terms: CompiledTerm[]; services: MatchService[]; categories: CategoryInfo[] },
  now = new Date(),
): MatchResult {
  const catInfo = new Map(data.categories.map((c) => [c.slug, c]));
  let cats = scoreCategories(input.text, data.terms);
  for (const chip of input.chips ?? []) {
    const existing = cats.find((c) => c.slug === chip);
    if (existing) existing.score = 1;
    else cats.push({ slug: chip, score: 1, reasons: ["selected"] });
  }
  if (input.ai) cats = mergeAi(cats, input.ai);
  cats = cats.filter((c) => catInfo.has(c.slug)).sort((a, b) => b.score - a.score);
  const strong = cats.filter((c) => c.score >= 0.3);
  let results = rankServices(data.services, strong, catInfo, input.filters, now);
  let usedFallback = false;
  if (results.length < 3 && input.text.trim()) {
    const seen = new Set(results.map((r) => r.service.id));
    const extra = textSearch(data.services, input.text, now).filter((r) => !seen.has(r.service.id));
    if (extra.length) usedFallback = true;
    results = [...results, ...extra.slice(0, 10)];
  }
  const byTier: MatchResult["byTier"] = { 1: [], 2: [], 3: [] };
  for (const r of results) byTier[(Math.min(Math.max(r.tier, 1), 3) as 1 | 2 | 3)].push(r);
  return { categories: strong, results, byTier, usedFallback };
}
