import { parseHours, scheduleSummary } from "../hours";
import { normalize, stem } from "../text";
import { DETAIL_BY_KEY, coerceDetail } from "../details";
import type { FetchedPage } from "./fetch";
import { DETAIL_RULES, NOT_FOR_CLIENTS, jsonLdHours, locationCount, sameSchedule } from "./extract-deterministic";
import type { Candidate, CandidateValue, DroppedCandidate, Method, VerifiedCandidate } from "./types";
import { addressKey, digits, nameTokens, normQuote } from "./util";

/**
 * The anti-hallucination gate. A candidate survives only if
 *  1. its quote appears verbatim in what we fetched (after whitespace/quote normalization),
 *  2. the quote itself supports the value (digits, schedule, street number, words), and
 *  3. its confidence (method, corroboration, page freshness) clears MIN_CONFIDENCE.
 * Everything dropped is returned with a reason so the run log can show it.
 */
export const BASE_CONFIDENCE: Record<Method, number> = { jsonld: 0.9, pattern: 0.75, llm: 0.55 };
export const MIN_CONFIDENCE = 0.5;
export const HIGH_CONFIDENCE = 0.85;
export const STALE_AFTER_MONTHS = 18;
const MIN_QUOTE: Record<Method, number> = { jsonld: 3, pattern: 4, llm: 8 };

/* ───────────── Page freshness ───────────── */

const MONTHS = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
const UPDATED_RE = new RegExp(`\\b(?:last\\s+)?(?:updated|revised|modified|reviewed)(?:\\s+on)?\\s*:?\\s*((?:${MONTHS})\\.?\\s+(?:\\d{1,2},?\\s+)?\\d{4}|\\d{1,2}/\\d{1,2}/\\d{2,4}|\\d{4}-\\d{2}-\\d{2})`, "i");
const COPYRIGHT_RE = /(?:©|&copy;|\bcopyright\b)\s*(?:\d{4}\s*[-–]\s*)?((?:19|20)\d{2})\b/i;

function parseLooseDate(s: string): Date | null {
  const d = new Date(s.replace(/(\d)(st|nd|rd|th)\b/, "$1"));
  if (!isNaN(+d)) return d;
  const m = s.match(new RegExp(`^(${MONTHS})\\.?\\s+(\\d{4})$`, "i"));
  if (m) {
    const d2 = new Date(`${m[1]} 1, ${m[2]}`);
    return isNaN(+d2) ? null : d2;
  }
  return null;
}

/** The most recent date the page claims about itself, and whether that's older than 18 months. */
export function pageFreshness(page: FetchedPage, now = new Date()): { datedAt: string | null; source: string | null; stale: boolean } {
  const dates: { source: string; date: Date }[] = [];
  const m = page.text.match(UPDATED_RE);
  if (m) {
    const d = parseLooseDate(m[1]);
    if (d) dates.push({ source: `text:${m[0].slice(0, 60)}`, date: d });
  }
  for (const n of page.jsonLd) {
    const v = n.dateModified ?? n.dateUpdated;
    if (typeof v === "string" && !isNaN(+new Date(v))) dates.push({ source: "jsonld:dateModified", date: new Date(v) });
  }
  for (const d of page.declaredDates) if (d.source.startsWith("meta:")) dates.push({ source: d.source, date: new Date(d.date) });
  if (!dates.length) {
    const c = page.text.match(COPYRIGHT_RE);
    if (c) dates.push({ source: `text:${c[0]}`, date: new Date(`${c[1]}-12-31T00:00:00Z`) });
  }
  if (!dates.length) {
    const h = page.declaredDates.find((d) => d.source === "header:last-modified");
    if (h) dates.push({ source: h.source, date: new Date(h.date) });
  }
  const valid = dates.filter((d) => +d.date <= +now + 86_400_000);
  if (!valid.length) return { datedAt: null, source: null, stale: false };
  const best = valid.sort((a, b) => +b.date - +a.date)[0];
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - STALE_AFTER_MONTHS);
  return { datedAt: best.date.toISOString(), source: best.source, stale: best.date < cutoff };
}

/* ───────────── Is this page about this service? ───────────── */

export function pageMentionsService(page: FetchedPage, svc: { name: string; organization?: string | null }): boolean {
  const hay = " " + normalize(`${page.title} ${page.text}`) + " ";
  const ok = (name: string | null | undefined) => {
    const toks = nameTokens(name ?? "");
    if (!toks.length) return false;
    const hits = toks.filter((t) => hay.includes(` ${t} `) || hay.includes(` ${t}s `)).length;
    return hits >= Math.max(1, Math.ceil(toks.length / 2));
  };
  // A name made only of stop words ("Boulder County Services") can't be checked; let it through.
  if (!nameTokens(svc.name).length && !nameTokens(svc.organization ?? "").length) return true;
  return ok(svc.name) || ok(svc.organization);
}

/* ───────────── Quote and support checks ───────────── */

function haystacks(page: FetchedPage) {
  return {
    text: normQuote(page.text),
    jsonld: normQuote(page.jsonLd.map((n) => JSON.stringify(n)).join("\n")),
    links: normQuote([...page.tel, ...page.mailto].map((l) => l.href).join("\n")),
  };
}

export function quoteFound(page: FetchedPage, c: Candidate, h = haystacks(page)): boolean {
  const qn = normQuote(c.evidence.quote);
  if (qn.length < MIN_QUOTE[c.evidence.method]) return false;
  if (h.text.includes(qn)) return true;
  if (c.evidence.method === "jsonld" && h.jsonld.includes(qn)) return true;
  if (c.evidence.method === "pattern" && /^(tel|mailto):/i.test(c.evidence.quote) && h.links.includes(qn)) return true;
  return false;
}

const STOP = new Set(["the", "and", "for", "are", "with", "you", "your", "our", "can", "will", "all", "any", "from", "this", "that", "into", "per", "each", "who", "may", "not", "but", "have", "has"]);
const words = (s: string) => normalize(s).split(" ").filter((w) => w.length > 2 && !STOP.has(w)).map(stem);
const numbers = (s: string) => s.match(/\d+/g) ?? [];

const LANGUAGE_ALIASES: Record<string, string[]> = {
  spanish: ["spanish", "espanol", "español"],
  english: ["english", "ingles"],
  french: ["french", "francais"],
  arabic: ["arabic"],
  "asl": ["asl", "american sign language", "sign language"],
  "american sign language": ["asl", "american sign language", "sign language"],
  vietnamese: ["vietnamese"],
  mandarin: ["mandarin", "chinese"],
  chinese: ["chinese", "mandarin", "cantonese"],
  russian: ["russian"],
  "interpreters on request": ["interpret"],
};
/** Words that must appear in a quote for an LLM boolean about this key to be about the right thing. */
const BOOLEAN_KEYWORDS: Record<string, RegExp> = {
  walkIn: /walk|drop[- ]?in|appointment|show up|just come/i,
  appointmentRequired: /appointment|schedul|book|call ahead|call first/i,
  idRequired: /\bid\b|identification|license|documentation/i,
};
const IRREGULAR = /\b(?:first|second|third|fourth|last|1st|2nd|3rd|4th|every other|alternat\w*|biweekly|bi-weekly|monthly|seasonal\w*|except|varies|by appointment|most|some|occasional\w*)\b/i;

function itemSupported(item: string, quote: string, key: string): boolean {
  const qn = " " + normalize(quote) + " ";
  const aliases = key === "languages" ? LANGUAGE_ALIASES[normalize(item)] ?? [normalize(item)] : null;
  if (aliases) return aliases.some((a) => qn.includes(normalize(a)));
  const w = words(item);
  if (!w.length) return false;
  const qw = new Set(words(quote));
  return w.filter((x) => qw.has(x)).length / w.length >= 0.6;
}

export type SupportResult = { ok: true; value: CandidateValue; note?: string } | { ok: false; reason: string };

/** Does the quote (by itself) support this value? May normalize the value (e.g. hours → summary). */
const DATED = new RegExp(`\\b(?:${MONTHS})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?\\b|\\b(?:0?[1-9]|1[0-2])/(?:0?[1-9]|[12]\\d|3[01])(?:/\\d{2,4})?\\b|\\bstarting\\b|\\bbeginning\\b`, "i");
const ONE_ACTIVITY = /\b(group|class|workshop|session|event|meeting|clinic day)s?\b/i;
const ALWAYS_OPEN = /\b24\/7\b|\b24 hours\b|\b24-hour\b/i;
const OPEN_WORDS = /\bopen\b|\bavailable\b|\bhours\b|\balways\b|\bday or night\b|\bany time\b|\banytime\b/i;
const NOT_OPENING = /\bsupervision\b|\bmonitor\w*|\bcare\b|\bstaff(?:ed)?\b|\bsupport\b|\bnursing\b|\bon[- ]site\b/i;
const COLORADO = new RegExp(`\\b(?:CO|Colo\\.?|Colorado)\\b|\\b80[0-6]\\d{2}\\b`);

/** Extra checks that only make sense for opening hours. Returns a reason to drop, or null. */
function hoursProblem(quote: string, serviceName = ""): string | null {
  if (NOT_FOR_CLIENTS.test(quote)) return "hours are for donations/volunteers/staff, not for clients";
  if (locationCount(quote) > 1) return "hours cover several locations";
  if (IRREGULAR.test(quote)) return "irregular schedule (monthly/holiday/exceptions) — needs a person";
  if (DATED.test(quote)) return "a dated event, not a weekly schedule";
  const act = quote.match(ONE_ACTIVITY);
  if (act && !new RegExp(`\\b${act[1]}`, "i").test(serviceName)) return `hours for one ${act[1].toLowerCase()}, not the whole service`;
  if (ALWAYS_OPEN.test(quote)) {
    if (/\d\s*(?:am|pm|a\.m\.|p\.m\.)?\s*(?:-|–|—|to)\s*\d/i.test(quote.replace(/24\/7(?:\/365)?/g, ""))) return "says 24 hours but also lists times";
    if (!OPEN_WORDS.test(quote) || NOT_OPENING.test(quote)) return "“24/7” here describes care, not opening hours";
  }
  return null;
}

export function supportedByQuote(page: FetchedPage, c: Candidate, serviceName = ""): SupportResult {
  const quote = c.evidence.quote;
  const v = c.value;
  switch (c.field) {
    case "phone": {
      const d = digits(String(v));
      if (d.length !== 10) return { ok: false, reason: "not a 10-digit phone number" };
      return quote.replace(/\D/g, "").includes(d) ? { ok: true, value: v } : { ok: false, reason: "phone digits not in quote" };
    }
    case "email":
      return quote.toLowerCase().includes(String(v).toLowerCase()) ? { ok: true, value: String(v).toLowerCase() } : { ok: false, reason: "email not in quote" };
    case "lat":
    case "lng":
      return quote.includes(String(v)) ? { ok: true, value: v } : { ok: false, reason: "coordinate not in quote" };
    case "address": {
      const key = addressKey(String(v));
      if (!key) return { ok: false, reason: "no street number in value" };
      if (!COLORADO.test(String(v)) && !/\b(?:Boulder|Longmont|Lafayette|Louisville|Broomfield|Superior|Erie|Lyons|Nederland|Niwot)\b/.test(String(v)))
        return { ok: false, reason: "address is outside Colorado" };
      const [num, street] = key.split(" ");
      const qn = " " + normalize(quote) + " ";
      return qn.includes(` ${num} `) && qn.includes(` ${street}`) ? { ok: true, value: v } : { ok: false, reason: "street number/name not in quote" };
    }
    case "hoursText": {
      const valueSpans = parseHours(String(v));
      if (!valueSpans.length) return { ok: false, reason: "hours value doesn't parse" };
      if (c.evidence.method === "jsonld") {
        const qn = normQuote(quote);
        const nodes = page.jsonLd.filter((n) => normQuote(JSON.stringify(n)).includes(qn));
        const ok = nodes.some((n) => sameSchedule(jsonLdHours(n), valueSpans));
        return ok ? { ok: true, value: scheduleSummary(valueSpans) } : { ok: false, reason: "structured hours don't match value" };
      }
      const problem = hoursProblem(quote, serviceName);
      if (problem) return { ok: false, reason: problem };
      const quoteSpans = parseHours(quote);
      return sameSchedule(quoteSpans, valueSpans) ? { ok: true, value: scheduleSummary(valueSpans) } : { ok: false, reason: "hours in quote differ from value" };
    }
  }
  // details.<key> and free-text record fields
  const key = c.field.startsWith("details.") ? c.field.slice(8) : c.field;
  const def = DETAIL_BY_KEY[key];
  const kind = def?.kind ?? "text";
  if (kind === "boolean") {
    const b = coerceDetail(key, v);
    if (typeof b !== "boolean") return { ok: false, reason: "not a yes/no value" };
    const ruled = DETAIL_RULES.filter((r) => r.key === key && r.re.test(quote) && !(r.unless && r.unless.test(quote))).map((r) => r.value);
    if (ruled.length) return ruled.includes(b) ? { ok: true, value: b } : { ok: false, reason: "quote says the opposite" };
    if (c.evidence.method !== "llm") return { ok: false, reason: "no matching phrase in quote" };
    return BOOLEAN_KEYWORDS[key]?.test(quote) ? { ok: true, value: b } : { ok: false, reason: `quote isn't about ${def?.label ?? key}` };
  }
  if (kind === "list") {
    const items = (coerceDetail(key, v) as string[] | null) ?? [];
    const kept = items.filter((i) => itemSupported(i, quote, key));
    if (!kept.length) return { ok: false, reason: "no list item appears in quote" };
    return { ok: true, value: kept, note: kept.length < items.length ? `pruned ${items.length - kept.length} unsupported item(s)` : undefined };
  }
  const s = String(v).trim();
  if (!s) return { ok: false, reason: "empty value" };
  const qNums = new Set(numbers(quote));
  if (numbers(s).some((n) => !qNums.has(n))) return { ok: false, reason: "a number in the value isn't in the quote" };
  if (key === "ageRange" && numbers(s).length) return { ok: true, value: s };
  if (c.evidence.method === "pattern") {
    const rules = DETAIL_RULES.filter((r) => r.key === key);
    if (rules.length) {
      const hit = rules.some((r) => r.value === s && r.re.test(quote) && !(r.unless && r.unless.test(quote)));
      return hit ? { ok: true, value: s } : { ok: false, reason: "no matching phrase in quote" };
    }
  }
  const w = words(s);
  if (!w.length) return numbers(s).length ? { ok: true, value: s } : { ok: false, reason: "value has no content words" };
  const qw = new Set(words(quote));
  const share = w.filter((x) => qw.has(x)).length / w.length;
  return share >= 0.7 ? { ok: true, value: s } : { ok: false, reason: `only ${Math.round(share * 100)}% of the value's words are in the quote` };
}

/* ───────────── Agreement ───────────── */

export function sameValue(field: string, a: unknown, b: unknown): boolean {
  if (a === null || a === undefined || a === "" || b === null || b === undefined || b === "") return false;
  switch (field) {
    case "phone":
      return digits(String(a)) === digits(String(b));
    case "hoursText":
      return sameSchedule(parseHours(String(a)), parseHours(String(b)));
    case "address":
      return addressKey(String(a)) === addressKey(String(b)) && addressKey(String(a)) !== null;
    case "lat":
    case "lng":
      return Math.abs(Number(a) - Number(b)) < 1e-4;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    const n = (x: unknown) => [x].flat().map((i) => normalize(String(i))).sort().join("|");
    return n(a) === n(b);
  }
  if (typeof a === "boolean" || typeof b === "boolean") return a === b;
  return normalize(String(a)) === normalize(String(b));
}

/* ───────────── The gate ───────────── */

export type VerifyContext = {
  service?: { name: string; organization?: string | null };
  /** Current record values keyed like candidates ("phone", "details.walkIn"). */
  current?: Record<string, unknown>;
  now?: Date;
};

export type VerifyResult = {
  verified: VerifiedCandidate[];
  dropped: DroppedCandidate[];
  page: { url: string; hash: string; datedAt: string | null; stale: boolean; mentionsService: boolean };
};

export function verifyCandidates(page: FetchedPage, candidates: Candidate[], ctx: VerifyContext = {}): VerifyResult {
  const fresh = pageFreshness(page, ctx.now);
  const mentions = ctx.service ? pageMentionsService(page, ctx.service) : true;
  const pageInfo = { url: page.url, hash: page.hash, datedAt: fresh.datedAt, stale: fresh.stale, mentionsService: mentions };
  const dropped: DroppedCandidate[] = [];
  if (!mentions) {
    return { verified: [], dropped: candidates.map((c) => ({ ...c, reason: "page doesn't mention this service by name" })), page: pageInfo };
  }
  const h = haystacks(page);
  const passed: Candidate[] = [];
  for (const c of candidates) {
    if (!quoteFound(page, c, h)) {
      dropped.push({ ...c, reason: "quote not found on the page" });
      continue;
    }
    const s = supportedByQuote(page, c, ctx.service?.name);
    if (!s.ok) {
      dropped.push({ ...c, reason: s.reason });
      continue;
    }
    passed.push({ ...c, value: s.value });
  }
  const verified: VerifiedCandidate[] = [];
  for (const c of passed) {
    const signals: string[] = [c.evidence.method];
    let conf = BASE_CONFIDENCE[c.evidence.method];
    const others = passed.filter((o) => o !== c && o.field === c.field && o.evidence.method !== c.evidence.method && sameValue(c.field, o.value, c.value));
    if (others.length) {
      conf += 0.1;
      signals.push(`corroborated:${[...new Set(others.map((o) => o.evidence.method))].join("+")}`);
    }
    if (ctx.current && sameValue(c.field, ctx.current[c.field], c.value)) {
      conf += 0.1;
      signals.push("matches-record");
    }
    if (fresh.stale) {
      conf -= 0.25;
      signals.push("stale-page");
    }
    conf = Math.round(Math.min(0.98, Math.max(0, conf)) * 100) / 100;
    if (conf < MIN_CONFIDENCE) dropped.push({ ...c, reason: `low confidence (${conf}: ${signals.join(", ")})` });
    else verified.push({ ...c, confidence: conf, signals });
  }
  return { verified, dropped, page: pageInfo };
}
