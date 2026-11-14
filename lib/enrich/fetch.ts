import { createHash } from "node:crypto";

/**
 * Polite page fetcher for enrichment.
 * - honours robots.txt (our UA token, then "*")
 * - at most 1 request per second per host
 * - 15 s timeout, 2 MB body cap, up to 3 redirects (each hop re-checked against robots.txt)
 * - HTML only; returns cleaned main text plus the raw structured bits we extract from
 */
export const USER_AGENT = "BFF-Navigator-Enricher/1.0 (+https://github.com/omniharmonic/bffresourcelibrary)";
const UA_TOKEN = "bff-navigator-enricher";
const TIMEOUT_MS = 15_000;
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const MIN_INTERVAL_MS = 1000;

export type PageLink = { href: string; value: string; text: string };

export type FetchedPage = {
  ok: true;
  url: string; // final URL after redirects
  requestedUrl: string;
  status: number;
  title: string;
  /** Visible text, nav/footer/scripts removed, one block per line. */
  text: string;
  /** Parsed JSON-LD blocks (flattened @graph). */
  jsonLd: Record<string, unknown>[];
  tel: PageLink[];
  mailto: PageLink[];
  /** Dates the page declares about itself (meta tags, Last-Modified header). ISO strings. */
  declaredDates: { source: string; date: string }[];
  /** sha256 hex of the normalized main text. */
  hash: string;
  truncated: boolean;
};
export type FetchFailure = { ok: false; url: string; reason: "robots" | "http" | "network" | "timeout" | "not-html" | "too-many-redirects" | "bad-url"; detail?: string };
export type FetchResult = FetchedPage | FetchFailure;

type Deps = { fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void>; now?: () => number };

/* ───────────── robots.txt ───────────── */

type RobotsRules = { allow: string[]; disallow: string[] } | "allow-all" | "disallow-all";

export function parseRobots(body: string, token = UA_TOKEN): RobotsRules {
  type Group = { agents: string[]; allow: string[]; disallow: string[] };
  const groups: Group[] = [];
  let cur: Group | null = null;
  let lastWasAgent = false;
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) continue;
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase(), val = m[2].trim();
    if (key === "user-agent") {
      if (!cur || !lastWasAgent) groups.push((cur = { agents: [], allow: [], disallow: [] }));
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!cur) continue;
    if (key === "allow" && val) cur.allow.push(val);
    if (key === "disallow" && val) cur.disallow.push(val);
  }
  const mine = groups.filter((g) => g.agents.some((a) => a !== "*" && token.includes(a.replace(/\/.*$/, ""))));
  const chosen = mine.length ? mine : groups.filter((g) => g.agents.includes("*"));
  if (!chosen.length) return "allow-all";
  return { allow: chosen.flatMap((g) => g.allow), disallow: chosen.flatMap((g) => g.disallow) };
}

function ruleMatches(rule: string, path: string) {
  const anchored = rule.endsWith("$");
  const pattern = rule.replace(/\$$/, "").split("*").map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*");
  return new RegExp("^" + pattern + (anchored ? "$" : "")).test(path);
}

export function robotsAllows(rules: RobotsRules, pathWithQuery: string): boolean {
  if (rules === "allow-all") return true;
  if (rules === "disallow-all") return false;
  // Longest match wins; Allow wins ties (RFC 9309).
  let best = { len: -1, allow: true };
  for (const r of rules.disallow) if (ruleMatches(r, pathWithQuery) && r.length > best.len) best = { len: r.length, allow: false };
  for (const r of rules.allow) if (ruleMatches(r, pathWithQuery) && r.length >= best.len) best = { len: r.length, allow: true };
  return best.allow;
}

/* ───────────── HTML → text ───────────── */

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", hellip: "…", copy: "©", middot: "·", bull: "•", eacute: "é", ntilde: "ñ", aacute: "á", iacute: "í", oacute: "ó", uacute: "ú" };
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

const STRIP_BLOCKS = ["script", "style", "noscript", "svg", "nav", "footer", "iframe", "template", "form", "select", "button"];
const BLOCK_TAGS = "p|div|section|article|main|aside|header|h[1-6]|li|ul|ol|tr|table|br|hr|dd|dt|dl|address|blockquote|pre|figure|figcaption|td|th";

/** Remove comments, <head>, scripts, nav, footer and other site chrome; keeps the page's own content. */
export function stripChrome(html: string): string {
  let h = html.replace(/<!--[\s\S]*?-->/g, " ").replace(/<head[\s\S]*?<\/head>/i, " ");
  for (const t of STRIP_BLOCKS) h = h.replace(new RegExp(`<${t}\\b[\\s\\S]*?<\\/${t}>`, "gi"), " ");
  // ARIA landmarks used instead of <nav>/<footer>
  return h.replace(/<(\w+)\b[^>]*role=["'](?:navigation|contentinfo)["'][^>]*>[\s\S]*?<\/\1>/gi, " ");
}

export function htmlToText(html: string): { title: string; text: string } {
  const title = decodeEntities((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").replace(/\s+/g, " ").trim());
  let h = stripChrome(html);
  h = h.replace(new RegExp(`<\\/?(?:${BLOCK_TAGS})\\b[^>]*>`, "gi"), "\n");
  h = h.replace(/<[^>]+>/g, " ");
  const text = decodeEntities(h)
    .replace(/ /g, " ")
    .split("\n")
    .map((l) => l.replace(/[ \t\f\v\r]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
  return { title, text };
}

export function extractJsonLd(html: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const push = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(push);
    if (!v || typeof v !== "object") return;
    const o = v as Record<string, unknown>;
    if (Array.isArray(o["@graph"])) (o["@graph"] as unknown[]).forEach(push);
    out.push(o);
  };
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      push(JSON.parse(m[1].trim().replace(/^<!\[CDATA\[|\]\]>$/g, "")));
    } catch {
      /* malformed JSON-LD is common; ignore the block */
    }
  }
  return out;
}

function extractLinks(html: string, scheme: "tel" | "mailto"): PageLink[] {
  const out: PageLink[] = [];
  const re = new RegExp(`<a\\b[^>]*href\\s*=\\s*["'](${scheme}:[^"']+)["'][^>]*>([\\s\\S]*?)<\\/a>`, "gi");
  for (const m of html.matchAll(re)) {
    const href = decodeEntities(m[1].trim());
    const value = decodeURIComponent(href.slice(scheme.length + 1).split("?")[0]).trim();
    const text = decodeEntities(m[2].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    if (value) out.push({ href, value, text });
  }
  return out;
}

function declaredDates(html: string, headers: Headers): { source: string; date: string }[] {
  const out: { source: string; date: string }[] = [];
  const add = (source: string, raw: string | null | undefined) => {
    if (!raw) return;
    const d = new Date(raw);
    if (!isNaN(+d)) out.push({ source, date: d.toISOString() });
  };
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    const name = tag.match(/(?:property|name|itemprop)\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
    const content = tag.match(/content\s*=\s*["']([^"']+)["']/i)?.[1];
    if (name && /(?:modified_time|updated_time|datemodified|last-modified|dc\.date\.modified)$/.test(name)) add(`meta:${name}`, content);
  }
  add("header:last-modified", headers.get("last-modified"));
  return out;
}

export const hashText = (text: string) => createHash("sha256").update(text.replace(/\s+/g, " ").trim().toLowerCase()).digest("hex");

/** Parse an already-downloaded HTML document (used by the fetcher and by tests with fixtures). */
export function parsePage(html: string, url: string, opts: { status?: number; headers?: Headers; requestedUrl?: string; truncated?: boolean } = {}): FetchedPage {
  const { title, text } = htmlToText(html);
  return {
    ok: true,
    url,
    requestedUrl: opts.requestedUrl ?? url,
    status: opts.status ?? 200,
    title,
    text,
    jsonLd: extractJsonLd(html),
    // Links in nav/footer are site-wide (other programs, volunteer lines), so only the page body counts.
    tel: extractLinks(stripChrome(html), "tel"),
    mailto: extractLinks(stripChrome(html), "mailto"),
    declaredDates: declaredDates(html, opts.headers ?? new Headers()),
    hash: hashText(text),
    truncated: !!opts.truncated,
  };
}

/* ───────────── Fetcher ───────────── */

async function readCapped(res: Response): Promise<{ body: string; truncated: boolean }> {
  if (!res.body) return { body: await res.text(), truncated: false };
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0, truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      chunks.push(value.subarray(0, value.byteLength - (total - MAX_BYTES)));
      truncated = true;
      await reader.cancel().catch(() => {});
      break;
    }
    chunks.push(value);
  }
  return { body: Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8"), truncated };
}

export function createFetcher(deps: Deps = {}) {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = deps.now ?? Date.now;
  const lastHit = new Map<string, number>();
  const robotsCache = new Map<string, RobotsRules>();

  async function politeFetch(url: URL): Promise<Response> {
    const host = url.host;
    const wait = (lastHit.get(host) ?? -Infinity) + MIN_INTERVAL_MS - now();
    if (wait > 0) await sleep(wait);
    lastHit.set(host, now());
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      return await fetchImpl(url.toString(), {
        redirect: "manual",
        signal: ctrl.signal,
        headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1" },
      });
    } finally {
      clearTimeout(timer);
    }
  }

  async function robotsFor(url: URL): Promise<RobotsRules> {
    const key = url.origin;
    const hit = robotsCache.get(key);
    if (hit) return hit;
    let rules: RobotsRules;
    try {
      const res = await politeFetch(new URL("/robots.txt", url));
      if (res.status >= 200 && res.status < 300) rules = parseRobots((await readCapped(res)).body);
      else if (res.status >= 500) rules = "disallow-all"; // RFC 9309: server error → assume disallowed
      else rules = "allow-all"; // 3xx/4xx (no robots.txt)
    } catch {
      rules = "disallow-all";
    }
    robotsCache.set(key, rules);
    return rules;
  }

  return async function fetchPage(input: string): Promise<FetchResult> {
    let url: URL;
    try {
      url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
    } catch {
      return { ok: false, url: input, reason: "bad-url" };
    }
    if (!/^https?:$/.test(url.protocol)) return { ok: false, url: input, reason: "bad-url" };
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if (!robotsAllows(await robotsFor(url), url.pathname + url.search)) return { ok: false, url: url.toString(), reason: "robots" };
      let res: Response;
      try {
        res = await politeFetch(url);
      } catch (e) {
        const name = (e as Error).name;
        return { ok: false, url: url.toString(), reason: name === "AbortError" || name === "TimeoutError" ? "timeout" : "network", detail: String((e as Error).message ?? e).slice(0, 200) };
      }
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        url = new URL(res.headers.get("location")!, url);
        continue;
      }
      if (res.status < 200 || res.status >= 300) return { ok: false, url: url.toString(), reason: "http", detail: String(res.status) };
      const ct = res.headers.get("content-type") ?? "";
      if (ct && !/html|xml/i.test(ct)) return { ok: false, url: url.toString(), reason: "not-html", detail: ct.slice(0, 80) };
      const { body, truncated } = await readCapped(res);
      return parsePage(body, url.toString(), { status: res.status, headers: res.headers, requestedUrl: input, truncated });
    }
    return { ok: false, url: url.toString(), reason: "too-many-redirects" };
  };
}
