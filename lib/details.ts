import type { ServiceDetails } from "./db/schema";

/**
 * Structured "before you go" facts for a service. These are the things a
 * street-outreach volunteer gets asked most: can I just show up, does it cost
 * anything, do I need ID, will they speak my language, how do I get there.
 *
 * Stored in services.details (jsonb); provenance in field_sources["details.<key>"].
 */
export type DetailKind = "text" | "boolean" | "list";
export type DetailKey = keyof Required<ServiceDetails>;

export const DETAIL_FIELDS: { key: DetailKey; label: string; kind: DetailKind; help: string }[] = [
  { key: "walkIn", label: "Walk-ins welcome", kind: "boolean", help: "Can someone just show up without calling ahead?" },
  { key: "appointmentRequired", label: "Appointment needed", kind: "boolean", help: "Must they book or call first?" },
  { key: "cost", label: "Cost", kind: "text", help: "Free, sliding scale, Medicaid/insurance accepted, or a set fee." },
  { key: "idRequired", label: "ID required", kind: "boolean", help: "Is a photo ID needed to be served?" },
  { key: "documentsToBring", label: "What to bring", kind: "list", help: "Documents or items to bring (ID, proof of income, insurance card…)." },
  { key: "languages", label: "Languages", kind: "list", help: "Languages staff speak or interpreters offered, besides English." },
  { key: "ageRange", label: "Ages served", kind: "text", help: "e.g. “18+”, “youth 12–24”, “60 and over”." },
  { key: "genderServed", label: "Who it serves", kind: "text", help: "e.g. “women and children”, “men only”, “all genders”." },
  { key: "accessibility", label: "Accessibility", kind: "text", help: "Wheelchair access, elevator, ASL, service animals." },
  { key: "whatToExpect", label: "What to expect", kind: "text", help: "What happens when you arrive, in plain words." },
  { key: "intakeProcess", label: "How intake works", kind: "text", help: "Forms, screening, waitlist or call-in steps." },
  { key: "capacityNotes", label: "Capacity", kind: "text", help: "e.g. “beds fill by 5pm”, “first 30 people”." },
  { key: "transit", label: "Getting there", kind: "text", help: "Nearest bus route or stop, parking, bike racks." },
  { key: "lastHoursChange", label: "Hours change notice", kind: "text", help: "Announced change to hours, with its date." },
];

export const DETAIL_KEYS = DETAIL_FIELDS.map((f) => f.key);
export const DETAIL_BY_KEY: Record<string, (typeof DETAIL_FIELDS)[number]> = Object.fromEntries(DETAIL_FIELDS.map((f) => [f.key, f]));

/** Coerce an incoming value to its detail kind; null means "clear this key", undefined means "ignore". */
export function coerceDetail(key: string, v: unknown): ServiceDetails[DetailKey] | null | undefined {
  const f = DETAIL_BY_KEY[key];
  if (!f || v === undefined) return undefined;
  if (v === null || v === "") return null;
  if (f.kind === "boolean") {
    if (typeof v === "boolean") return v;
    const s = String(v).trim().toLowerCase();
    if (["yes", "true", "y", "1"].includes(s)) return true;
    if (["no", "false", "n", "0"].includes(s)) return false;
    return undefined;
  }
  if (f.kind === "list") {
    const arr = Array.isArray(v) ? v : String(v).split(/\s*[,;\n]\s*/);
    const out = [...new Set(arr.map((x) => String(x).trim()).filter(Boolean))];
    return out.length ? out : null;
  }
  const s = String(v).trim();
  return s ? s : null;
}

/** Merge a details patch into existing details. Returns the merged object and the keys that changed. */
export function mergeDetails(prev: ServiceDetails | null | undefined, patch: Record<string, unknown> | null | undefined) {
  const next: Record<string, unknown> = { ...(prev ?? {}) };
  const changed: string[] = [];
  for (const [k, raw] of Object.entries(patch ?? {})) {
    const v = coerceDetail(k, raw);
    if (v === undefined) continue;
    if (v === null) {
      if (k in next) {
        delete next[k];
        changed.push(k);
      }
      continue;
    }
    if (JSON.stringify(next[k]) !== JSON.stringify(v)) changed.push(k);
    next[k] = v;
  }
  return { details: next as ServiceDetails, changed };
}

/** Human-readable value for summaries and the review UI. */
export function formatDetail(key: string, v: unknown): string {
  const f = DETAIL_BY_KEY[key];
  if (v === undefined || v === null) return "";
  if (f?.kind === "boolean") return v ? "yes" : "no";
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
}
