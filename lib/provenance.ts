import type { FieldSource } from "./db/schema";

const HUMAN = /^(volunteer|admin|seed):/;

export type FeedDecision = { apply: Record<string, unknown>; review: Record<string, unknown>; unchanged: string[] };

/**
 * The "human wins" rule. A feed may update a field only if that field is not
 * locked and its current value came from that same feed (or is empty).
 */
export function decideFeedUpdate(
  current: Record<string, unknown>,
  sources: Record<string, FieldSource>,
  locked: string[],
  incoming: Record<string, unknown>,
  feedId: string,
): FeedDecision {
  const apply: Record<string, unknown> = {};
  const review: Record<string, unknown> = {};
  const unchanged: string[] = [];
  for (const [k, v] of Object.entries(incoming)) {
    if (v === undefined || v === null || v === "") continue;
    const cur = current[k];
    if (cur === v || (typeof cur === "number" && typeof v === "number" && Math.abs(cur - v) < 1e-6)) {
      unchanged.push(k);
      continue;
    }
    const src = sources[k]?.source ?? "";
    const empty = cur === null || cur === undefined || cur === "";
    if (locked.includes(k)) review[k] = v;
    else if (empty) apply[k] = v;
    else if (src === `feed:${feedId}`) apply[k] = v;
    else if (HUMAN.test(src) || src) review[k] = v;
    else apply[k] = v;
  }
  return { apply, review, unchanged };
}

export function stampSources(prev: Record<string, FieldSource>, fields: string[], source: string, at = new Date()) {
  const next = { ...prev };
  for (const f of fields) next[f] = { source, at: at.toISOString() };
  return next;
}
