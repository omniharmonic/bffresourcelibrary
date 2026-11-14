import { sql } from "drizzle-orm";
import { getDb, schema } from "../db";

/**
 * Which services most need a person to check them in the field?
 *
 *   score = usage × staleness × gaps
 *   usage     = 1 + log2(1 + times added to plans)   (+1 if BFF-preferred)
 *   staleness = months since verified_at / 6, capped at 3 (never verified = 3)
 *   gaps      = 1 + share of key facts missing (hours, phone, address, walk-in, cost, ID)
 *
 * Websites can't tell us whether the door is actually open; this list is for that.
 */
export const KEY_FACTS: { key: string; label: string; has: (s: typeof schema.services.$inferSelect) => boolean }[] = [
  { key: "hoursText", label: "hours", has: (s) => !!(s.hoursText || s.schedule?.length) },
  { key: "phone", label: "phone", has: (s) => !!s.phone },
  { key: "address", label: "address", has: (s) => !!s.address },
  { key: "details.walkIn", label: "walk-ins", has: (s) => s.details?.walkIn !== undefined || s.details?.appointmentRequired !== undefined },
  { key: "details.cost", label: "cost", has: (s) => !!s.details?.cost },
  { key: "details.idRequired", label: "ID needed", has: (s) => s.details?.idRequired !== undefined },
];

export type VerifyQueueItem = {
  serviceId: string;
  name: string;
  score: number;
  planUses: number;
  verifiedAt: string | null;
  monthsSinceVerified: number | null;
  missing: string[];
  /** Plain-words reason for the UI, e.g. "On 12 plans · never checked in person · missing hours, cost". */
  reason: string;
};

export function scoreService(s: typeof schema.services.$inferSelect, planUses: number, now = new Date()): VerifyQueueItem {
  const months = s.verifiedAt ? (+now - +s.verifiedAt) / (30.44 * 86_400_000) : null;
  const staleness = months === null ? 3 : Math.min(3, Math.max(0.1, months / 6));
  const missing = KEY_FACTS.filter((f) => !f.has(s)).map((f) => f.label);
  const usage = 1 + Math.log2(1 + planUses) + (s.preferred ? 1 : 0);
  const gaps = 1 + missing.length / KEY_FACTS.length;
  const score = Math.round(usage * staleness * gaps * 100) / 100;
  const bits = [
    planUses ? `On ${planUses} plan${planUses === 1 ? "" : "s"}` : s.preferred ? "BFF preferred" : "Not on plans yet",
    months === null ? "never checked in person" : `checked ${Math.round(months)} month${Math.round(months) === 1 ? "" : "s"} ago`,
    missing.length ? `missing ${missing.join(", ")}` : "",
  ].filter(Boolean);
  return {
    serviceId: s.id,
    name: s.name,
    score,
    planUses,
    verifiedAt: s.verifiedAt ? s.verifiedAt.toISOString() : null,
    monthsSinceVerified: months === null ? null : Math.round(months * 10) / 10,
    missing,
    reason: bits.join(" · "),
  };
}

export async function servicesNeedingFieldCheck(opts: { limit?: number; now?: Date } = {}): Promise<VerifyQueueItem[]> {
  const db = getDb();
  const rows = await db.select().from(schema.services).where(sql`${schema.services.status} <> 'inactive'`);
  const counts = await db
    .select({ serviceId: schema.planItems.serviceId, n: sql<number>`count(*)::int` })
    .from(schema.planItems)
    .groupBy(schema.planItems.serviceId);
  const uses = new Map(counts.map((c) => [c.serviceId, Number(c.n)]));
  return rows
    .map((s) => scoreService(s, uses.get(s.id) ?? 0, opts.now))
    .sort((a, b) => b.score - a.score)
    .slice(0, opts.limit ?? 20);
}
