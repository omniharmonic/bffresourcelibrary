import type { schema } from "../db";
import { DETAIL_BY_KEY, DETAIL_FIELDS, formatDetail } from "../details";
import { HIGH_CONFIDENCE, sameValue, type VerifyResult } from "./verify";
import type { CandidateValue, EnrichPayload, PayloadEvidence, VerifiedCandidate } from "./types";

type Svc = typeof schema.services.$inferSelect;

/** Field provenance written by a person (see docs/ARCHITECTURE.md §3.2). */
const HUMAN = /^(volunteer|admin|seed):/;
/** Long free-text fields we only fill when empty: rewording a person's text isn't worth Libby's time. */
const FILL_ONLY = new Set(["eligibility", "access", "details.whatToExpect", "details.intakeProcess"]);

export function currentValue(svc: Svc, field: string): CandidateValue | null {
  if (field.startsWith("details.")) {
    const v = (svc.details as Record<string, unknown> | null)?.[field.slice(8)];
    return v === undefined || v === null || v === "" ? null : (v as CandidateValue);
  }
  const v = (svc as unknown as Record<string, unknown>)[field];
  return v === undefined || v === null || v === "" ? null : (v as CandidateValue);
}

export function currentValues(svc: Svc, fields: string[]): Record<string, unknown> {
  return Object.fromEntries(fields.map((f) => [f, currentValue(svc, f)]));
}

export type ProposalDecision = { field: string; action: "propose" | "skip"; why: string };
export type Proposal = { payload: EnrichPayload; summary: string; decisions: ProposalDecision[] };

const PHRASE: Record<string, (v: CandidateValue) => string> = {
  hoursText: (v) => `hours ${v}`,
  phone: (v) => `phone ${v}`,
  email: (v) => `email ${v}`,
  address: (v) => `address ${v}`,
  eligibility: () => "who it's for",
  access: () => "how to get help",
  "details.walkIn": (v) => (v ? "walk-ins welcome" : "no walk-ins"),
  "details.appointmentRequired": (v) => (v ? "appointment needed" : "no appointment needed"),
  "details.idRequired": (v) => (v ? "ID required" : "no ID required"),
  "details.cost": (v) => `cost: ${String(v).toLowerCase()}`,
  "details.languages": (v) => `languages: ${formatDetail("languages", v)}`,
};

function phrase(field: string, v: CandidateValue): string {
  const p = PHRASE[field];
  if (p) return p(v);
  if (field.startsWith("details.")) {
    const key = field.slice(8);
    const label = DETAIL_BY_KEY[key]?.label.toLowerCase() ?? key;
    const s = formatDetail(key, v);
    return `${label}: ${s.length > 60 ? s.slice(0, 57) + "…" : s}`;
  }
  return field;
}

const LABEL: Record<string, string> = { hoursText: "hours", phone: "phone", address: "address", email: "email", eligibility: "who it's for", access: "how to get help" };
const fieldLabel = (k: string) => LABEL[k] ?? (k.startsWith("details.") ? (DETAIL_BY_KEY[k.slice(8)]?.label.toLowerCase() ?? k) : k);

const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/** Plain-words summary for the review queue, e.g. "Website lists hours Mon–Fri 9am–5pm and walk-ins welcome." */
const ORDER = ["hoursText", "phone", "address", "email", "eligibility", "access", ...DETAIL_FIELDS.map((f) => `details.${f.key}`)];
const byOrder = (a: string, b: string) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99);

export function summarize(payload: EnrichPayload): string {
  const keys = Object.keys(payload.evidence).filter((k) => k !== "lat" && k !== "lng").sort(byOrder);
  const val = (k: string) => (k.startsWith("details.") ? payload.details[k.slice(8)] : payload.fields[k]) as CandidateValue;
  const parts = keys.map((k) => phrase(k, val(k)));
  if (!parts.length && payload.evidence.lat) parts.push("a map location");
  let s = `Website lists ${list(parts)}.`;
  if (payload.conflicts.length) s = `Conflicts with field notes (${[...payload.conflicts].sort(byOrder).map(fieldLabel).join(", ")}). ` + s;
  if (payload.page.stale && payload.page.datedAt) {
    const d = new Date(payload.page.datedAt).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "America/Denver" });
    s += ` Page last updated ${d}, so it may be out of date.`;
  }
  return s;
}

/**
 * Compare verified candidates with the record and decide what to put in front of Libby.
 * Rules (human wins): never touch locked fields; skip fields a person set unless the
 * candidate is high-confidence AND disagrees (then flag "conflicts with field notes");
 * only propose fields that are empty or differ.
 */
export function buildProposal(svc: Svc, result: VerifyResult, now = new Date()): Proposal | null {
  const decisions: ProposalDecision[] = [];
  const best = new Map<string, VerifiedCandidate>();
  for (const c of result.verified) {
    const prev = best.get(c.field);
    const rank = (x: VerifiedCandidate) => x.confidence + (x.evidence.method === "jsonld" ? 0.001 : x.evidence.method === "pattern" ? 0.0005 : 0);
    if (!prev || rank(c) > rank(prev)) best.set(c.field, c);
  }
  const locked = new Set(svc.lockedFields ?? []);
  const sources = svc.fieldSources ?? {};
  const payload: EnrichPayload = {
    fields: {},
    details: {},
    evidence: {},
    conflicts: [],
    page: { url: result.page.url, hash: result.page.hash, checkedAt: now.toISOString(), datedAt: result.page.datedAt, stale: result.page.stale },
  };
  for (const [field, c] of best) {
    const isDetail = field.startsWith("details.");
    if (locked.has(field) || (isDetail && locked.has("details")) || ((field === "lat" || field === "lng") && locked.has("address"))) {
      decisions.push({ field, action: "skip", why: "locked" });
      continue;
    }
    const cur = currentValue(svc, field);
    if (cur !== null && sameValue(field, cur, c.value)) {
      decisions.push({ field, action: "skip", why: "already matches" });
      continue;
    }
    let conflict = false;
    if (cur !== null) {
      if (field === "lat" || field === "lng" || FILL_ONLY.has(field)) {
        decisions.push({ field, action: "skip", why: "only filled when empty" });
        continue;
      }
      const src = sources[field]?.source ?? "";
      if (HUMAN.test(src)) {
        if (c.confidence < HIGH_CONFIDENCE) {
          decisions.push({ field, action: "skip", why: `set by a person (${src.split(":")[0]}); website differs but confidence ${c.confidence} is not high` });
          continue;
        }
        conflict = true;
      }
    }
    if (isDetail) payload.details[field.slice(8)] = c.value as string | boolean | string[];
    else payload.fields[field] = c.value as string | number;
    const ev: PayloadEvidence = { ...c.evidence, confidence: c.confidence, previous: cur };
    if (conflict) {
      ev.conflictsWithFieldNotes = true;
      payload.conflicts.push(field);
    }
    payload.evidence[field] = ev;
    decisions.push({ field, action: "propose", why: conflict ? "conflicts with a person's value (high confidence)" : cur === null ? "empty on record" : "differs from record" });
  }
  // A map pin alone isn't worth a review item; only send it alongside something else.
  const meaningful = Object.keys(payload.evidence).filter((k) => k !== "lat" && k !== "lng");
  if (!meaningful.length) return null;
  if (payload.evidence.lat && !payload.evidence.lng) delete payload.evidence.lat, delete payload.fields.lat;
  if (payload.evidence.lng && !payload.evidence.lat) delete payload.evidence.lng, delete payload.fields.lng;
  return { payload, summary: summarize(payload), decisions };
}

/** The part of a payload that identifies "the same proposal" for de-duplication. */
export const proposalKey = (p: { fields?: unknown; details?: unknown }) => ({ fields: p.fields ?? {}, details: p.details ?? {} });
