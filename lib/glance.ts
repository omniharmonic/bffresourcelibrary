import { openStatus, scheduleSummary } from "./hours";
import type { ScheduleSpan } from "./db/schema";

/**
 * "At a glance": the three things someone needs first — when, where, how to reach them —
 * plus the key "before you go" facts. Derived from structured fields, falling back to the
 * free-text "how to access" notes BFF volunteers already wrote (where many addresses and
 * meeting spots live).
 */
export type Glance = {
  when: { state: string; label: string; hours: string | null };
  where: { text: string; kind: "address" | "spot"; mapUrl: string | null } | null;
  phone: string | null;
  facts: string[];
};

type Input = {
  address?: string | null;
  access?: string | null;
  hoursText?: string | null;
  schedule?: ScheduleSpan[] | null;
  phone?: string | null;
  details?: Record<string, unknown> | null;
};

const TOWNS = "Boulder|Longmont|Louisville|Lafayette|Superior|Broomfield|Lyons|Nederland|Erie|Denver|Westminster";
// e.g. "4869 N Broadway", "1419 Pine St", "2650 Table Mesa", "3080 Broadway, Boulder", "1107 W Century Drive, Louisville"
const STREET = new RegExp(
  String.raw`\b(\d{2,5}(?:-\d+)?\s+(?!(?:AM|PM|noon)\b)(?:[NSEW]\.?\s+)?(?:\d+(?:st|nd|rd|th)|[A-Z][A-Za-z'’]+)(?:\s+(?:[A-Z][A-Za-z'’]+|St\.?|Ave\.?|Rd\.?|Dr\.?|Blvd\.?|Ln\.?|Ct\.?|Pl\.?|Pkwy\.?|Cir\.?|Way|Circle|Drive|Street|Avenue|Road|Lane|Court|Place|Parkway)){0,3})(?:,?\s*(?:Unit|Suite|Ste\.?|#)\s*[\w-]+)?(?:,\s*(${TOWNS}))?`,
);
const LEADING_WHEN = /^\s*(?:mon|tues?|wed(?:nes)?|thu(?:rs)?|fri|sat(?:ur)?|sun)(?:day)?s?\b[^.;]*?\d[^.;]*[.;]\s+/i;
const PLACEY = /\b(park|library|church|lot|corner|bandshell|garage|center|centre|shelter|hall|plaza|mall|station|courthouse|clinic|school|campus|fence|bleachers)\b/i;

export function extractStreetAddress(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = text.match(STREET);
  if (!m) return null;
  const addr = m[0].replace(/[.,;\s]+$/, "");
  // Avoid times/phone fragments ("11 AM", "303 444") — need a word with a letter after the number.
  if (!/\d+\s+\S*[A-Za-z]/.test(addr)) return null;
  return m[2] ? addr : `${addr}, Boulder`;
}

export function extractMeetingSpot(access: string | null | undefined): string | null {
  if (!access) return null;
  const rest = access.replace(LEADING_WHEN, "");
  const first = rest.split(/[;.\n](?:\s|$)/)[0]?.trim();
  if (!first || first.length < 4 || first.length > 90) return null;
  if (!PLACEY.test(first)) return null;
  if (/^(call|ask|text|email|online|apply|confirm|verify)\b/i.test(first)) return null;
  return first;
}

const mapUrl = (q: string) => `https://maps.google.com/?q=${encodeURIComponent(/\bCO\b|Colorado/.test(q) ? q : `${q}, CO`)}`;

export function glance(s: Input, now = new Date()): Glance {
  const o = openStatus(s.schedule ?? null, now);
  const sched = scheduleSummary(s.schedule ?? null);
  const hours = sched || s.hoursText?.trim() || null;
  const when = { state: o.state, label: o.state === "unknown" ? (hours ? "Hours" : "Call for hours") : o.label, hours };

  let where: Glance["where"] = null;
  if (s.address?.trim()) where = { text: s.address.trim(), kind: "address", mapUrl: mapUrl(s.address.trim()) };
  else {
    const street = extractStreetAddress(s.access);
    if (street) where = { text: street, kind: "address", mapUrl: mapUrl(street) };
    else {
      const spot = extractMeetingSpot(s.access);
      if (spot) where = { text: spot, kind: "spot", mapUrl: /central park|bandshell/i.test(spot) ? mapUrl("Central Park, Boulder") : null };
    }
  }

  const d = s.details ?? {};
  const facts: string[] = [];
  if (d.walkIn === true) facts.push("Walk-ins welcome");
  else if (d.appointmentRequired === true || d.walkIn === false) facts.push("Call or book first");
  if (typeof d.cost === "string" && d.cost) facts.push(/^free\b/i.test(d.cost) ? "Free" : d.cost);
  if (d.idRequired === false) facts.push("No ID needed");
  else if (d.idRequired === true) facts.push("Bring ID");

  return { when, where, phone: s.phone?.trim() || null, facts };
}
