/**
 * Shared types for the enrichment pipeline (lib/enrich/*).
 *
 *   fetch → extract (deterministic, optional LLM) → verify (anti-hallucination gate) → propose (review queue)
 */
export type Method = "jsonld" | "pattern" | "llm";

/** Where a value came from. `quote` is a verbatim snippet (≤200 chars) of the fetched page. */
export type Evidence = { url: string; quote: string; method: Method };

/** Record fields we enrich, plus "details.<key>" for lib/details.ts keys. */
export type EnrichField = "phone" | "email" | "address" | "hoursText" | "lat" | "lng" | "eligibility" | "access" | `details.${string}`;

export type CandidateValue = string | number | boolean | string[];

export type Candidate = { field: EnrichField; value: CandidateValue; evidence: Evidence };

export type VerifiedCandidate = Candidate & {
  confidence: number;
  /** Why the score is what it is, e.g. ["jsonld", "corroborated:pattern", "stale-page"]. */
  signals: string[];
};

export type DroppedCandidate = Candidate & { reason: string };

/** Evidence as stored on a change request payload, keyed by field (e.g. "hoursText", "details.walkIn"). */
export type PayloadEvidence = Evidence & {
  confidence: number;
  /** The value on the record when this was proposed (null if empty). */
  previous: CandidateValue | null;
  /** True when the record's current value was set by a person (volunteer/admin/seed) and this disagrees. */
  conflictsWithFieldNotes?: boolean;
};

export type EnrichPayload = {
  fields: Record<string, string | number>;
  details: Record<string, string | boolean | string[]>;
  evidence: Record<string, PayloadEvidence>;
  /** Keys that disagree with a human-verified value. Empty when none. */
  conflicts: string[];
  page: { url: string; hash: string; checkedAt: string; datedAt?: string | null; stale?: boolean };
};
