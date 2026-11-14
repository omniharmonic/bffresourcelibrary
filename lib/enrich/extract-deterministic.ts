import type { ScheduleSpan } from "../db/schema";
import { parseHours, scheduleSummary } from "../hours";
import { formatAddress, formatPhone } from "../ingest/connectors/arcgis";
import type { FetchedPage } from "./fetch";
import type { Candidate, DroppedCandidate } from "./types";
import { MAX_QUOTE, addressKey, digits, sentences, window } from "./util";

/**
 * No-AI extraction. Every value carries a verbatim quote from the page:
 * - method "jsonld": the quote is a substring of the page's JSON-LD (as JSON.stringify'd)
 * - method "pattern": the quote is a substring of the visible text (or a tel:/mailto: href)
 *
 * When the page is ambiguous (two different phone numbers, two schedules, two
 * addresses) we extract nothing for that field and say why.
 */
export type Extraction = { candidates: Candidate[]; ambiguous: DroppedCandidate[] };

const ORG_TYPES = /Organization|LocalBusiness|GovernmentOffice|GovernmentOrganization|NGO|Place|MedicalClinic|MedicalOrganization|Library|CivicStructure|FoodEstablishment|LodgingBusiness|Hospital|Physician|Dentist|Pharmacy|HealthAndBeautyBusiness|ProfessionalService|Service|EmergencyService|Church|PlaceOfWorship/i;

const typeOf = (n: Record<string, unknown>) => [n["@type"]].flat().map(String).join(" ");
const q = (v: unknown) => JSON.stringify(v).slice(0, MAX_QUOTE);

/* ───────────── JSON-LD hours ───────────── */

const SCHEMA_DAYS: Record<string, number> = { su: 0, mo: 1, tu: 2, we: 3, th: 4, fr: 5, sa: 6, sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
const hhmm = (s: unknown) => {
  const m = String(s ?? "").match(/^(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : null;
};

/** schema.org openingHours ("Mo-Fr 09:00-17:00") and openingHoursSpecification → spans. */
export function jsonLdHours(node: Record<string, unknown>): ScheduleSpan[] {
  const spans: ScheduleSpan[] = [];
  const push = (days: number[], open: string | null, close: string | null) => {
    if (!open || !close) return;
    if (close === "00:00" || close === "24:00") close = "23:59";
    for (const day of days) spans.push({ day, open, close });
  };
  for (const s of [node.openingHours].flat().filter((x): x is string => typeof x === "string")) {
    for (const m of s.matchAll(/\b([A-Za-z]{2}(?:\s*[-,]\s*[A-Za-z]{2}\b)*)\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/g)) {
      const days = new Set<number>();
      for (const seg of m[1].split(",")) {
        const [a, b] = seg.trim().toLowerCase().split("-").map((d) => SCHEMA_DAYS[d.trim().slice(0, 2)]);
        if (a === undefined) continue;
        if (b === undefined) days.add(a);
        else for (let d = a; ; d = (d + 1) % 7) { days.add(d); if (d === b) break; }
      }
      push([...days], hhmm(m[2]), hhmm(m[3]));
    }
  }
  for (const spec of [node.openingHoursSpecification].flat().filter(Boolean) as Record<string, unknown>[]) {
    if (spec.validThrough && new Date(String(spec.validThrough)) < new Date()) continue;
    const days = [spec.dayOfWeek].flat().map((d) => SCHEMA_DAYS[String(d).replace(/^.*\//, "").toLowerCase()]).filter((d): d is number => d !== undefined);
    push(days, hhmm(spec.opens), hhmm(spec.closes));
  }
  const seen = new Set<string>();
  return spans.filter((s) => (seen.has(JSON.stringify(s)) ? false : (seen.add(JSON.stringify(s)), true))).sort((a, b) => a.day - b.day || a.open.localeCompare(b.open));
}

export const sameSchedule = (a: ScheduleSpan[], b: ScheduleSpan[]) => {
  const k = (x: ScheduleSpan[]) => x.map((s) => `${s.day}${s.open}${s.close}`).sort().join("|");
  return a.length > 0 && k(a) === k(b);
};

function fromJsonLd(page: FetchedPage, out: Candidate[], ambiguous: DroppedCandidate[]) {
  const ev = (quote: string) => ({ url: page.url, quote, method: "jsonld" as const });
  const orgs = page.jsonLd.filter((n) => ORG_TYPES.test(typeOf(n)));
  const phones = new Map<string, string>();
  const addrs = new Map<string, { value: string; quote: string }>();
  const hours: { spans: ScheduleSpan[]; quote: string }[] = [];
  for (const n of orgs) {
    const tel = typeof n.telephone === "string" ? n.telephone : null;
    const f = tel ? formatPhone(tel) : undefined;
    if (tel && f) phones.set(digits(f), tel);
    const a = n.address as Record<string, unknown> | string | undefined;
    if (a && typeof a === "object" && a.streetAddress) {
      const value = formatAddress({ street: String(a.streetAddress), city: a.addressLocality as string, state: (a.addressRegion as string) ?? undefined, zip: a.postalCode as string });
      const key = value && addressKey(value);
      if (value && key) addrs.set(key, { value, quote: q(a) });
    }
    const spans = jsonLdHours(n);
    if (spans.length && !hours.some((h) => sameSchedule(h.spans, spans))) hours.push({ spans, quote: q(n.openingHoursSpecification ?? n.openingHours) });
    const geo = n.geo as Record<string, unknown> | undefined;
    const lat = Number(geo?.latitude), lng = Number(geo?.longitude);
    if (geo && Number.isFinite(lat) && Number.isFinite(lng) && lat > 39.5 && lat < 40.6 && lng > -106 && lng < -104.5) {
      out.push({ field: "lat", value: lat, evidence: ev(q(geo)) }, { field: "lng", value: lng, evidence: ev(q(geo)) });
    }
    if (typeof n.email === "string" && /@/.test(n.email)) out.push({ field: "email", value: n.email.replace(/^mailto:/i, "").trim(), evidence: ev(q(n.email)) });
  }
  if (phones.size === 1) {
    const [raw] = [...phones.values()];
    out.push({ field: "phone", value: formatPhone(raw)!, evidence: ev(q(raw)) });
  }
  if (addrs.size === 1) {
    const [{ value, quote }] = [...addrs.values()];
    out.push({ field: "address", value, evidence: ev(quote) });
  }
  if (hours.length === 1) out.push({ field: "hoursText", value: scheduleSummary(hours[0].spans), evidence: ev(hours[0].quote) });
  else if (hours.length > 1) ambiguous.push({ field: "hoursText", value: hours.map((h) => scheduleSummary(h.spans)).join(" / "), evidence: ev(hours[0].quote), reason: "structured data lists several different schedules" });
  if (phones.size > 1) ambiguous.push({ field: "phone", value: [...phones.values()].join(" / "), evidence: ev(q([...phones.values()][0])), reason: "structured data lists several phone numbers" });
}

/* ───────────── Patterns in visible text ───────────── */

const PHONE_RE = /(?:\+?1[\s.-]?)?\(?\b([2-9]\d{2})\)?[\s.-]?(\d{3})[\s.-](\d{4})\b(?:\s*(?:x|ext\.?)\s*\d+)?/g;
const NOT_MAIN_PHONE = /\bfax\b|\bnurse\b|\badvice line\b|\btty\b|\btdd\b|\bcrisis\b|\bhotline\b|\b988\b|\b911\b|\bafter[- ]hours\b/i;
const MAIN_PHONE = /\bmain (?:line|number|office)\b|\bfront desk\b|\breception\b|\bmain\b/i;

const CITY = "(?:Boulder|Longmont|Lafayette|Louisville|Broomfield|Superior|Erie|Lyons|Nederland|Niwot|Gunbarrel|Ward|Jamestown)";
const SUFFIX = "(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Ln|Lane|Way|Pkwy|Parkway|Ct|Court|Pl|Place|Cir|Circle|Hwy|Highway|Trl|Trail|Pike|Mall|Plaza)";
const ADDRESS_RE = new RegExp(`\\b\\d{1,5}\\s+(?:[NSEW]\\.?\\s+|North\\s+|South\\s+|East\\s+|West\\s+)?(?:[A-Z0-9][A-Za-z0-9'.]*\\s+){0,4}?${SUFFIX}\\.?(?:,?\\s*(?:Suite|Ste\\.?|Unit|Room|Rm\\.?|#)\\s*[A-Za-z0-9-]+)?,?\\s+${CITY}(?:,?\\s*(?:CO|Colo\\.?|Colorado))?(?:,?\\s+80\\d{3})?\\b`, "g");

/** Hours that aren't for the people we serve. */
export const NOT_FOR_CLIENTS = /\bdonat\w*|\bvolunteer\w*|\badministrative\b|\bboard meeting|\bbusiness office\b|\bstaff only\b/i;
const STREET_RE = new RegExp(`\\b\\d{2,5}\\s+(?:[NSEW]\\.?\\s+)?(?:[A-Z0-9][A-Za-z0-9'.]*\\s+){0,3}?${SUFFIX}\\b`, "g");
/** Number of distinct places (street addresses or Boulder-area towns) a passage mentions. */
export function locationCount(s: string): number {
  const streets = new Set([...s.matchAll(STREET_RE)].map((m) => m[0].toLowerCase()));
  const cities = new Set([...s.matchAll(new RegExp(`\\b${CITY}\\b`, "g"))].map((m) => m[0]));
  return Math.max(streets.size, cities.size);
}
const HOURS_CONTEXT = /\bhours\b|\bopen\b|\bclosed\b|\bdaily\b|\bweekdays\b|\bserv(?:ed|ing|es)\b|\bavailable\b|\bfrom\b|\d\s*(?:-|–|—|to)\s*\d|(?:am|pm|a\.m\.|p\.m\.)\s*(?:-|–|—|to)/i;
const NOT_HOURS = /\bcrisis\b|\bhotline\b|\bcall\b.*\b24\/7\b|\bposted\b|\bpublished\b|©|\bcopyright\b/i;

function phonesFromText(page: FetchedPage, out: Candidate[], ambiguous: DroppedCandidate[]) {
  type P = { d: string; quote: string; main: boolean };
  const found: P[] = [];
  for (const line of page.text.split("\n")) {
    for (const m of line.matchAll(PHONE_RE)) {
      const ctx = line.slice(Math.max(0, m.index! - 40), m.index! + m[0].length + 20);
      if (NOT_MAIN_PHONE.test(ctx)) continue;
      found.push({ d: digits(m[0]), quote: window(line, m.index!, m.index! + m[0].length), main: MAIN_PHONE.test(ctx) });
    }
  }
  for (const t of page.tel) {
    const d = digits(t.value);
    if (d.length !== 10 || NOT_MAIN_PHONE.test(t.text)) continue;
    // The visible line around the link says what the number is for ("Nurse Advice Line", "Fax").
    if (page.text.split("\n").some((l) => l.replace(/\D/g, "").includes(d) && NOT_MAIN_PHONE.test(l))) continue;
    if (!found.some((f) => f.d === d)) found.push({ d, quote: t.href, main: MAIN_PHONE.test(t.text) });
  }
  const distinct = [...new Set(found.map((f) => f.d))];
  let pick: P | undefined;
  if (distinct.length === 1) pick = found[0];
  else if (distinct.length > 1) {
    const mains = [...new Set(found.filter((f) => f.main).map((f) => f.d))];
    if (mains.length === 1) pick = found.find((f) => f.main);
  }
  const ev = (quote: string) => ({ url: page.url, quote, method: "pattern" as const });
  if (pick) out.push({ field: "phone", value: formatPhone(pick.d)!, evidence: ev(pick.quote) });
  else if (distinct.length > 1)
    ambiguous.push({ field: "phone", value: distinct.map((d) => formatPhone(d)!).join(" / "), evidence: ev(found[0].quote), reason: `page lists ${distinct.length} different phone numbers` });
}

function addressesFromText(page: FetchedPage, out: Candidate[], ambiguous: DroppedCandidate[]) {
  const found = new Map<string, { value: string; quote: string }>();
  for (const line of page.text.split("\n")) {
    for (const m of line.matchAll(ADDRESS_RE)) {
      const value = m[0].replace(/\s+/g, " ").replace(/\s+,/g, ",").trim();
      const key = addressKey(value);
      if (key && !found.has(key)) found.set(key, { value, quote: window(line, m.index!, m.index! + m[0].length) });
    }
  }
  const ev = (quote: string) => ({ url: page.url, quote, method: "pattern" as const });
  const all = [...found.values()];
  if (all.length === 1) out.push({ field: "address", value: all[0].value, evidence: ev(all[0].quote) });
  else if (all.length > 1) ambiguous.push({ field: "address", value: all.map((a) => a.value).join(" / "), evidence: ev(all[0].quote), reason: `page lists ${all.length} different addresses` });
}

function hoursFromText(page: FetchedPage, out: Candidate[], ambiguous: DroppedCandidate[]) {
  // Group consecutive hours lines into blocks ("Monday 9–5\nTuesday 9–5\n…").
  const lines = page.text.split("\n");
  const blocks: { heading: string; lines: string[] }[] = [];
  let cur: string[] = [];
  let heading = "";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const ok = line.length <= 400 && HOURS_CONTEXT.test(line) && !NOT_HOURS.test(line) && parseHours(line).length > 0;
    if (ok) {
      if (!cur.length) heading = i > 0 && lines[i - 1].length <= 80 ? lines[i - 1] : "";
      cur.push(line);
    } else if (cur.length) (blocks.push({ heading, lines: cur }), (cur = []));
  }
  if (cur.length) blocks.push({ heading, lines: cur });
  type B = { quote: string; spans: ScheduleSpan[] };
  const found: B[] = [];
  const ev = (quote: string) => ({ url: page.url, quote, method: "pattern" as const });
  for (const { heading, lines: b } of blocks) {
    const all = [heading, ...b].join("\n");
    if (NOT_FOR_CLIENTS.test(all)) {
      ambiguous.push({ field: "hoursText", value: scheduleSummary(parseHours(b.join("\n"))), evidence: ev(window(all, 0, Math.min(all.length, MAX_QUOTE))), reason: "hours are for donations/volunteers/staff, not for clients" });
      continue;
    }
    if (locationCount(all) > 1) {
      ambiguous.push({ field: "hoursText", value: scheduleSummary(parseHours(b.join("\n"))), evidence: ev(window(all, 0, Math.min(all.length, MAX_QUOTE))), reason: "hours cover several locations" });
      continue;
    }
    // Include a short heading ("Pantry hours:") so the reviewer sees what the hours are for.
    const withHeading = heading ? [heading, ...b] : b;
    let quote = (withHeading.join("\n").length <= MAX_QUOTE ? withHeading : b).join("\n");
    if (quote.length > MAX_QUOTE) {
      // Keep whole lines that fit; otherwise a window around the first time range.
      const kept: string[] = [];
      for (const l of b) if ([...kept, l].join("\n").length <= MAX_QUOTE) kept.push(l); else break;
      quote = kept.length ? kept.join("\n") : window(b[0], 0, Math.min(b[0].length, MAX_QUOTE));
    }
    const spans = parseHours(quote);
    if (spans.length) found.push({ quote, spans });
  }
  const distinct: B[] = [];
  for (const f of found) if (!distinct.some((d) => sameSchedule(d.spans, f.spans))) distinct.push(f);
  if (distinct.length === 1) out.push({ field: "hoursText", value: scheduleSummary(distinct[0].spans), evidence: ev(distinct[0].quote) });
  else if (distinct.length > 1)
    ambiguous.push({ field: "hoursText", value: distinct.map((d) => scheduleSummary(d.spans)).join(" / "), evidence: ev(distinct[0].quote), reason: `page shows ${distinct.length} different schedules (maybe different programs)` });
}

function emailsFromLinks(page: FetchedPage, out: Candidate[]) {
  const vals = [...new Set(page.mailto.map((m) => m.value.toLowerCase()).filter((v) => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(v)))];
  if (vals.length === 1) {
    const link = page.mailto.find((m) => m.value.toLowerCase() === vals[0])!;
    const inText = page.text.toLowerCase().includes(vals[0]);
    out.push({ field: "email", value: vals[0], evidence: { url: page.url, quote: inText ? vals[0] : link.href, method: "pattern" } });
  }
}

/* ───────────── Detail phrases (high-precision only) ───────────── */

type Rule = { key: string; re: RegExp; value: string | boolean | string[]; unless?: RegExp };
export const DETAIL_RULES: Rule[] = [
  { key: "walkIn", re: /\bno walk[- ]?ins\b|\bwalk[- ]?ins? (?:are )?not (?:accepted|available|allowed)\b/i, value: false },
  { key: "walkIn", re: /\bwalk[- ]?ins? (?:are |always )?(?:welcome|accepted|available)\b|\bno appointments? (?:is |are )?(?:necessary|needed|required)\b|\bwithout an appointment\b/i, value: true },
  { key: "appointmentRequired", re: /\bby appointment only\b|\bappointments? (?:is |are )?(?:required|necessary)\b|\bappointment needed\b/i, value: true, unless: /\bno appointments?\b|\bnot required\b/i },
  { key: "appointmentRequired", re: /\bno appointments? (?:is |are )?(?:necessary|needed|required)\b/i, value: false },
  { key: "idRequired", re: /\bno (?:photo |valid )?(?:id|identification) (?:is |are )?(?:required|needed|necessary)\b|\b(?:id|identification) (?:is )?not (?:required|needed|necessary)\b/i, value: false },
  { key: "idRequired", re: /\b(?:photo |valid |government[- ]issued )?(?:id|identification) (?:is |are )?required\b|\bmust (?:bring|show|present) (?:a |your )?(?:photo |valid )?(?:id|identification)\b/i, value: true, unless: /\bno (?:photo |valid )?(?:id|identification)\b|\bnot required\b/i },
  { key: "cost", re: /\bsliding[- ]fee\b|\bsliding[- ]scale\b/i, value: "Sliding scale" },
  {
    key: "cost",
    re: /\b(?:services?|care|meals?|food|groceries|essentials|treatment|counseling|therapy|everything|showers?|laundry|clinic|conversations|visits|support|it) (?:is |are )?(?:always |completely |totally |100% )?(?:free\b|(?:provided |offered |available )?(?:at no cost|free of charge)\b)/i,
    value: "Free",
    unless: /\bconsult\w*|\binitial\b|\bfirst (?:visit|session|appointment)\b|\bassessment\b|\bevaluation\b|\bscreening\b|\bverif\w*|\bcoverage\b|\bestimate\b|\bquote\b|\bparking\b|\bwi-?fi\b|\bfeel free\b|\btoll[- ]free\b|\bshipping\b|\btrial\b|\bnot free\b/i,
  },
  {
    key: "languages",
    re: /\bse habla español\b|\b(?:we have|we offer|our|with) (?:[\w-]+ ){0,3}?spanish[- ]speaking\b|\bbilingual (?:\(?english[/ ]?(?:and )?spanish\)?|spanish)|\b(?:services|support|help|care) (?:is |are )?(?:also )?(?:available |offered )?in spanish\b|\bdisponibles? en español\b|\bwe speak spanish\b/i,
    value: ["Spanish"],
    unless: /\bfind(?:ing)?\b|\blooking for\b|\bsearch\w*|\breferral\b/i,
  },
  { key: "accessibility", re: /\b(?:wheelchair|ada)[- ]accessible\b/i, value: "Wheelchair accessible", unless: /\bnot (?:wheelchair|ada)[- ]accessible\b/i },
];

function detailsFromText(page: FetchedPage, out: Candidate[], ambiguous: DroppedCandidate[]) {
  const byKey = new Map<string, Candidate[]>();
  for (const s of sentences(page.text)) {
    for (const r of DETAIL_RULES) {
      const m = s.match(r.re);
      if (!m || (r.unless && r.unless.test(s))) continue;
      const quote = window(s, m.index!, m.index! + m[0].length);
      const list = byKey.get(r.key) ?? [];
      if (!list.some((c) => JSON.stringify(c.value) === JSON.stringify(r.value))) list.push({ field: `details.${r.key}`, value: r.value, evidence: { url: page.url, quote, method: "pattern" } });
      byKey.set(r.key, list);
    }
  }
  // Age ranges: "ages 12-24", "18 and older" (not when the sentence is about one group or class)
  for (const s of sentences(page.text)) {
    if (/\bgroups?\b|\bclass(?:es)?\b|\bworkshops?\b|\bcamps?\b|\bteams?\b|\bparents of\b/i.test(s)) continue;
    const m =
      s.match(/\b(?:ages?|aged)\s+(\d{1,2})\s*(?:-|–|to|through)\s*(\d{1,2})\b/i) ??
      s.match(/\b(?:ages?|aged|adults?)\s+(\d{2})\s*(?:\+|and (?:over|older|up)\b)/i) ??
      s.match(/\bmust be (?:at least )?(\d{2})(?:\+|\s+(?:years? old )?(?:and|or) (?:over|older|up)\b)/i);
    if (!m) continue;
    const value = m[2] ? `Ages ${m[1]}–${m[2]}` : `${m[1]}+`;
    const list = byKey.get("ageRange") ?? [];
    if (!list.some((c) => c.value === value)) list.push({ field: "details.ageRange", value, evidence: { url: page.url, quote: window(s, m.index!, m.index! + m[0].length), method: "pattern" } });
    byKey.set("ageRange", list);
  }
  for (const [key, list] of byKey) {
    if (list.length === 1) out.push(list[0]);
    else ambiguous.push({ ...list[0], reason: `page says contradictory things about ${key}` });
  }
}

export function extractDeterministic(page: FetchedPage): Extraction {
  const candidates: Candidate[] = [];
  const ambiguous: DroppedCandidate[] = [];
  fromJsonLd(page, candidates, ambiguous);
  phonesFromText(page, candidates, ambiguous);
  addressesFromText(page, candidates, ambiguous);
  hoursFromText(page, candidates, ambiguous);
  emailsFromLinks(page, candidates);
  detailsFromText(page, candidates, ambiguous);
  return { candidates, ambiguous };
}
