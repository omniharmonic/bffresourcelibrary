import { asc } from "drizzle-orm";
import { getDb, schema } from "./db";
import { compileTerms, type CompiledTerm, type CategoryInfo, type MatchService } from "./match";
import type { ScheduleSpan } from "./db/schema";

export type ServiceRow = typeof schema.services.$inferSelect;
export type Service = ServiceRow & { categories: string[] };
export type Category = typeof schema.categories.$inferSelect;
export type Dimension = typeof schema.dimensions.$inferSelect;

export type Catalog = {
  dimensions: Dimension[];
  categories: Category[];
  categoryMap: Map<string, Category>;
  services: Service[];
  serviceMap: Map<string, Service>;
  terms: CompiledTerm[];
  loadedAt: number;
};

const g = globalThis as unknown as { __bffCatalog?: { value?: Catalog; promise?: Promise<Catalog>; version: number } };
const state = (g.__bffCatalog ??= { version: 0 });
const TTL_MS = 30_000;

async function load(): Promise<Catalog> {
  const db = getDb();
  const [dimensions, categories, services, links, terms] = await Promise.all([
    db.select().from(schema.dimensions).orderBy(asc(schema.dimensions.position)),
    db.select().from(schema.categories),
    db.select().from(schema.services),
    db.select().from(schema.serviceCategories),
    db.select().from(schema.needTerms),
  ]);
  const catsByService = new Map<string, string[]>();
  for (const l of links) catsByService.set(l.serviceId, [...(catsByService.get(l.serviceId) ?? []), l.categorySlug]);
  const full = services.map((s) => ({ ...s, categories: catsByService.get(s.id) ?? [] }));
  const dimOrder = new Map(dimensions.map((d) => [d.slug, d.position]));
  categories.sort(
    (a, b) => (dimOrder.get(a.dimensionSlug) ?? 99) - (dimOrder.get(b.dimensionSlug) ?? 99) || a.tier - b.tier || a.name.localeCompare(b.name),
  );
  return {
    dimensions,
    categories,
    categoryMap: new Map(categories.map((c) => [c.slug, c])),
    services: full.sort((a, b) => a.name.localeCompare(b.name)),
    serviceMap: new Map(full.map((s) => [s.id, s])),
    terms: compileTerms(terms.map((t) => ({ phrase: t.phrase, categorySlug: t.categorySlug, weight: t.weight }))),
    loadedAt: Date.now(),
  };
}

/**
 * Cached per server instance for speed (search). On serverless hosts each instance has its own
 * cache, so pages where staleness would confuse an editor (admin, service detail/edit) pass
 * { fresh: true } to read straight from the database.
 */
export async function getCatalog(opts: { fresh?: boolean } = {}): Promise<Catalog> {
  if (opts.fresh) {
    const c = await load();
    state.value = c;
    return c;
  }
  if (state.value && Date.now() - state.value.loadedAt < TTL_MS) return state.value;
  if (!state.promise) {
    const v = state.version;
    state.promise = load()
      .then((c) => {
        if (state.version === v) state.value = c;
        return c;
      })
      .finally(() => {
        state.promise = undefined;
      });
  }
  return state.promise;
}

export function invalidateCatalog() {
  state.version++;
  state.value = undefined;
}

export function toMatchService(s: Service): MatchService {
  return {
    id: s.id,
    name: s.name,
    summary: s.summary,
    access: s.access,
    fieldNotes: s.fieldNotes,
    organization: s.organization,
    categories: s.categories,
    preferred: s.preferred,
    status: s.status,
    verifiedAt: s.verifiedAt,
    schedule: s.schedule as ScheduleSpan[] | null,
    petPolicy: s.petPolicy,
    eligibility: s.eligibility,
    startsAt: s.startsAt,
    endsAt: s.endsAt,
  };
}

export function categoryInfos(c: Catalog): CategoryInfo[] {
  return c.categories.map((x) => ({ slug: x.slug, name: x.name, tier: x.tier, dimensionSlug: x.dimensionSlug }));
}
