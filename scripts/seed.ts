/**
 * Idempotent seed: taxonomy, Libby's curated resources, decision trees, gaps,
 * needs lexicon, and research-based review proposals (as PENDING items).
 * Existing services are never overwritten.
 */
import fs from "node:fs";
import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "../lib/db";
import { slugify } from "../lib/slug";
import { applyServiceChange, createChangeRequest } from "../lib/services";

const read = <T>(p: string): T | null => (fs.existsSync(p) ? (JSON.parse(fs.readFileSync(p, "utf8")) as T) : null);

type BffResource = {
  id: string; name: string; categories: string[]; summary: string; access: string; notes: string; phone: string; url: string;
  status: string; petAccess: string; verified: string; preferred: boolean; rules: string; rulesUrl: string; eventTime: string; eventDay: string; police: string;
};
type BffData = { dimensions: Record<string, string[][]>; colors: Record<string, string>; resources: BffResource[]; gaps: Gap[]; followups: Gap[] };
type Gap = { title: string; ideas: string; owner: string; status: string };
type CategorySeed = { slug: string; name: string; dimension: string; tier: number; alsoIn: { dimension: string; tier: number }[]; description: string; icon: string };

const INTERNAL = /(before publishing|do not (share|publish)|don.t (share|publish)|internal|ask \w+ before)/i;

async function main() {
  const db = getDb();
  const bff = read<BffData>("data/seed/bff-v3.json")!;
  const cats = read<CategorySeed[]>("data/seed/categories.json")!;
  const trees = read<Record<string, { title: string; nodes: Record<string, unknown> }>>("data/seed/decision-trees.json")!;

  // Dimensions
  const dimNames = Object.keys(bff.dimensions);
  for (const [i, name] of dimNames.entries()) {
    await db
      .insert(schema.dimensions)
      .values({ slug: slugify(name), name, color: bff.colors[name] ?? "#748c1d", position: i })
      .onConflictDoUpdate({ target: schema.dimensions.slug, set: { name, color: bff.colors[name] ?? "#748c1d", position: i } });
  }

  // Categories
  for (const c of cats) {
    const v = {
      slug: c.slug, name: c.name, dimensionSlug: c.dimension, tier: c.tier, alsoIn: c.alsoIn,
      description: c.description || null, icon: c.icon || null, isCrisis: c.slug === "mental-health-crisis",
    };
    await db.insert(schema.categories).values(v).onConflictDoUpdate({ target: schema.categories.slug, set: v });
  }

  // Decision trees
  for (const [i, [slug, t]] of Object.entries(trees).entries()) {
    const v = { slug, title: t.title, nodes: t.nodes as never, position: i };
    await db.insert(schema.decisionTrees).values(v).onConflictDoUpdate({ target: schema.decisionTrees.slug, set: v });
  }

  // Needs lexicon (file-managed in v1)
  const terms = read<{ phrase: string; category: string; weight: number; lang: string }[]>("data/seed/need-terms.json");
  if (terms) {
    const valid = new Set(cats.map((c) => c.slug));
    await db.delete(schema.needTerms);
    const rows = terms.filter((t) => valid.has(t.category)).map((t) => ({ phrase: t.phrase, categorySlug: t.category, weight: t.weight, lang: t.lang }));
    for (let i = 0; i < rows.length; i += 500) await db.insert(schema.needTerms).values(rows.slice(i, i + 500));
    console.log(`lexicon: ${rows.length} terms`);
  } else {
    console.warn("lexicon: data/seed/need-terms.json missing — matching will rely on chips and keyword search");
  }

  // Services (insert only)
  const existing = new Set((await db.select({ id: schema.services.id }).from(schema.services)).map((r) => r.id));
  let created = 0;
  for (const r of bff.resources) {
    if (existing.has(r.id)) continue;
    const when = [r.eventDay, r.eventTime].filter(Boolean).join(" ");
    const internal = INTERNAL.test(r.notes);
    await applyServiceChange({
      kind: "create",
      serviceId: r.id,
      actor: "seed:bff",
      status: "active",
      payload: {
        preferred: !!r.preferred,
        categories: r.categories.map(slugify),
        fields: {
          name: r.name,
          summary: r.summary,
          access: r.access,
          hoursText: when || null,
          phone: r.phone,
          url: r.url,
          petPolicy: r.petAccess,
          police: r.police,
          rules: r.rules,
          rulesUrl: r.rulesUrl,
          fieldNotes: internal ? null : r.notes,
          internalNotes: internal ? r.notes : null,
        },
      },
    });
    if (r.status || r.verified) {
      const d = r.verified ? new Date(r.verified) : null;
      await db
        .update(schema.services)
        .set({ verificationNote: r.status || null, verifiedAt: d && !isNaN(d.getTime()) ? d : null })
        .where(eq(schema.services.id, r.id));
    }
    created++;
  }
  console.log(`services: ${created} created, ${existing.size} already present`);

  // Gaps & follow-ups (only on first seed)
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.gaps);
  if (!n) {
    const rows = [
      ...bff.gaps.map((g) => ({ kind: "gap", ...g })),
      ...bff.followups.map((g) => ({ kind: "followup", ...g })),
    ].map((g) => ({ kind: g.kind, title: g.title, ideas: g.ideas || null, owner: g.owner || null, status: g.status || "Not started" }));
    if (rows.length) await db.insert(schema.gaps).values(rows);
    console.log(`gaps: ${rows.length}`);
  }

  // Default settings
  for (const [key, value] of Object.entries({ participant_mode: false, ai_assist: false })) {
    await db.insert(schema.settings).values({ key, value }).onConflictDoNothing();
  }

  // Research-based review proposals → pending queue (once)
  const proposals = read<{
    additions: (Record<string, string> & { categories: string[] })[];
    corrections: { resourceId: string; resourceName: string; fields: Record<string, string>; reason: string; sourceUrl: string }[];
  }>("data/seed/review-proposals.json");
  const already = await db.select().from(schema.changeRequests).where(eq(schema.changeRequests.source, "research"));
  if (proposals && !already.length) {
    for (const a of proposals.additions) {
      const { categories, sourceUrl, sourceNote, ...fields } = a;
      await createChangeRequest({
        kind: "create",
        payload: { fields: fields as Record<string, string>, categories },
        summary: `Suggested addition from research: ${a.name}. ${sourceNote ?? ""} ${sourceUrl ?? ""}`.trim(),
        source: "research",
      });
    }
    for (const c of proposals.corrections) {
      const { status, ...fields } = c.fields;
      await createChangeRequest({
        kind: status === "inactive" ? "archive" : "update",
        serviceId: c.resourceId,
        payload: { fields, ...(status ? { status } : {}) },
        summary: `Suggested correction for ${c.resourceName}: ${c.reason} ${c.sourceUrl ?? ""}`.trim(),
        source: "research",
      });
    }
    console.log(`review proposals: ${proposals.additions.length} additions, ${proposals.corrections.length} corrections`);
  }
  console.log("Seed complete.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
