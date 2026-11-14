import { normalize } from "../text";

export const MAX_QUOTE = 200;

/** Normalization used to compare a quote with page text: curly quotes/dashes, entities-as-text and whitespace. */
export function normQuote(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[‘’‚‛′`´]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/…/g, "...")
    .replace(/[ \s]+/g, " ")
    .trim()
    .toLowerCase();
}

/** Split page text into sentence-ish units (lines, then sentence ends). */
export function sentences(text: string): string[] {
  return text
    .split("\n")
    .flatMap((l) => l.split(/(?<=[.!?])\s+(?=[A-Z0-9¿¡"“])/))
    .map((s) => s.trim())
    .filter(Boolean);
}

/** A verbatim window (≤ MAX_QUOTE chars) of `s` around [start, end), cut at word boundaries. */
export function window(s: string, start: number, end: number, max = MAX_QUOTE): string {
  if (s.length <= max) return s;
  const span = end - start;
  if (span >= max) return s.slice(start, start + max);
  let a = Math.max(0, start - Math.floor((max - span) / 2));
  let b = Math.min(s.length, a + max);
  a = Math.max(0, b - max);
  if (a > 0) {
    const sp = s.indexOf(" ", a);
    if (sp !== -1 && sp < start) a = sp + 1;
  }
  if (b < s.length) {
    const sp = s.lastIndexOf(" ", b);
    if (sp > end) b = sp;
  }
  return s.slice(a, b);
}

export const digits = (s: string) => {
  const d = s.replace(/\D/g, "");
  return d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
};

/** Content words of a name (for "does this page talk about this service?"). */
const STOP = new Set(["the", "of", "and", "for", "at", "in", "a", "an", "to", "on", "boulder", "county", "colorado", "co", "inc", "program", "services", "service", "center", "centre"]);
export function nameTokens(name: string): string[] {
  return normalize(name)
    .split(" ")
    .filter((w) => w.length > 2 && !STOP.has(w));
}

/** "1234 Main St, Boulder" → "1234 main" (number + first street word) for loose address comparison. */
export function addressKey(a: string): string | null {
  const m = normalize(a).match(/\b(\d{1,6})\s+([a-z0-9]+)(?:\s+([a-z0-9]+))?/);
  if (!m) return null;
  const dir = /^(n|s|e|w|north|south|east|west)$/.test(m[2]) && m[3] ? m[3] : m[2];
  return `${m[1]} ${dir}`;
}
