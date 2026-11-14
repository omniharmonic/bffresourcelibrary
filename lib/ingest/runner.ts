import { eq, and } from "drizzle-orm";
import { getDb, schema } from "../db";
import { normalize } from "../text";
import { decideFeedUpdate } from "../provenance";
import { applyServiceChange, createChangeRequest } from "../services";
import type { Connector, FeedRecord } from "./types";

type Svc = typeof schema.services.$inferSelect;

function metersBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function findExisting(rec: FeedRecord, feedId: string, services: Svc[], claimed: Set<string>): Svc | undefined {
  const byId = services.find((s) => s.externalIds?.[feedId] === rec.externalId);
  if (byId) return byId;
  const name = normalize(rec.fields.name);
  return services.find((s) => {
    // A service already linked to a different record of this feed (or claimed this run) is not a name match.
    if (claimed.has(s.id) || (s.externalIds?.[feedId] && s.externalIds[feedId] !== rec.externalId)) return false;
    if (normalize(s.name) !== name) return false;
    if (rec.fields.lat == null || s.lat == null || s.lng == null || rec.fields.lng == null) return true;
    return metersBetween({ lat: s.lat, lng: s.lng }, { lat: rec.fields.lat, lng: rec.fields.lng }) < 100;
  });
}

/** JSON with sorted keys — Postgres jsonb does not preserve key order. */
export function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stableJson((v as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(v);
}

async function pendingExists(serviceId: string | null, source: string, payload: unknown) {
  const rows = await getDb()
    .select()
    .from(schema.changeRequests)
    .where(and(eq(schema.changeRequests.status, "pending"), eq(schema.changeRequests.source, source)));
  const p = stableJson(payload);
  return rows.some((r) => r.serviceId === serviceId && stableJson(r.payload) === p);
}

export async function runConnector(c: Connector, opts: { fetchImpl?: typeof fetch; log?: (s: string) => void } = {}) {
  const db = getDb();
  const log = opts.log ?? (() => {});
  const source = `feed:${c.id}`;
  const stats = { fetched: 0, created: 0, updated: 0, review: 0, unchanged: 0, notices: 0 };
  const [run] = await db.insert(schema.ingestRuns).values({ source: c.id }).returning();
  try {
    const { records, notices = [] } = await c.fetch({ fetchImpl: opts.fetchImpl });
    stats.fetched = records.length;
    const services = await db.select().from(schema.services);
    const now = new Date();

    const claimed = new Set<string>();
    for (const rec of records) {
      const existing = findExisting(rec, c.id, services, claimed);
      if (existing) claimed.add(existing.id);
      if (!existing) {
        const id = await applyServiceChange({
          kind: "create",
          payload: { fields: rec.fields as Record<string, string | number>, categories: rec.categories },
          actor: source,
          status: "unverified",
          externalIds: { [c.id]: rec.externalId },
        });
        await createChangeRequest({
          kind: "update",
          serviceId: id,
          payload: { status: "active" },
          summary: `New from ${c.label}: “${rec.fields.name}”. Review and publish, or reject to keep it hidden.`,
          source,
        });
        stats.created++;
        continue;
      }
      const d = decideFeedUpdate(existing as unknown as Record<string, unknown>, existing.fieldSources ?? {}, existing.lockedFields ?? [], rec.fields, c.id);
      if (Object.keys(d.apply).length) {
        if (process.env.INGEST_DEBUG) console.log("apply", existing.id, d.apply, Object.fromEntries(Object.keys(d.apply).map((k) => [k, (existing as Record<string, unknown>)[k]])));
        await applyServiceChange({
          kind: "update",
          serviceId: existing.id,
          payload: { fields: d.apply as Record<string, string | number> },
          actor: source,
          externalIds: { [c.id]: rec.externalId },
        });
        stats.updated++;
      } else {
        stats.unchanged++;
      }
      if (Object.keys(d.review).length) {
        const payload = { fields: d.review };
        if (!(await pendingExists(existing.id, source, payload))) {
          await createChangeRequest({
            kind: "update",
            serviceId: existing.id,
            payload,
            summary: `${c.label} reports different ${Object.keys(d.review).join(", ")} for “${existing.name}”.`,
            source,
          });
          stats.review++;
        }
      }
      await db.update(schema.services).set({ lastSeenAt: now }).where(eq(schema.services.id, existing.id));
    }

    for (const n of notices) {
      const payload = { key: n.key, url: n.url ?? null };
      const all = await db.select().from(schema.changeRequests).where(and(eq(schema.changeRequests.kind, "notice"), eq(schema.changeRequests.source, source)));
      if (all.some((r) => (r.payload as { key?: string }).key === n.key)) continue;
      await createChangeRequest({ kind: "notice", payload, summary: n.summary, source });
      stats.notices++;
    }

    await db.update(schema.ingestRuns).set({ status: "ok", finishedAt: new Date(), stats }).where(eq(schema.ingestRuns.id, run.id));
    log(`${c.id}: ${JSON.stringify(stats)}`);
    return stats;
  } catch (e) {
    await db
      .update(schema.ingestRuns)
      .set({ status: "error", finishedAt: new Date(), stats, error: String((e as Error).message ?? e).slice(0, 1000) })
      .where(eq(schema.ingestRuns.id, run.id));
    log(`${c.id}: ERROR ${(e as Error).message}`);
    return { ...stats, error: 1 };
  }
}
