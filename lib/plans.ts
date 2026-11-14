import { randomBytes } from "node:crypto";
import { and, asc, desc, eq } from "drizzle-orm";
import { getDb, schema } from "./db";

export type PlanItemInput = { serviceId: string; tier: number; note?: string };
export type Plan = typeof schema.plans.$inferSelect & { items: (typeof schema.planItems.$inferSelect)[] };

const token = () => randomBytes(16).toString("base64url");

export async function savePlan(input: {
  planId?: string | null;
  ownerId?: string | null;
  forLabel?: string;
  showLabel?: boolean;
  tags?: string[];
  intakeText?: string;
  navigatorName?: string;
  note?: string;
  items: PlanItemInput[];
}): Promise<{ id: string; shareToken: string }> {
  const db = getDb();
  const now = new Date();
  let id = input.planId ?? null;
  let shareToken: string;
  if (id) {
    const [p] = await db.select().from(schema.plans).where(eq(schema.plans.id, id));
    if (!p || (p.ownerId && p.ownerId !== input.ownerId)) throw new Error("Plan not found");
    shareToken = p.shareToken;
    await db
      .update(schema.plans)
      .set({
        forLabel: input.forLabel ?? p.forLabel,
        showLabel: input.showLabel ?? p.showLabel,
        tags: input.tags ?? p.tags,
        intakeText: input.ownerId ? (input.intakeText ?? p.intakeText) : null,
        navigatorName: input.navigatorName ?? p.navigatorName,
        note: input.note ?? p.note,
        updatedAt: now,
      })
      .where(eq(schema.plans.id, id));
    await db.delete(schema.planItems).where(eq(schema.planItems.planId, id));
  } else {
    id = "p_" + randomBytes(6).toString("hex");
    shareToken = token();
    await db.insert(schema.plans).values({
      id,
      shareToken,
      ownerId: input.ownerId ?? null,
      forLabel: input.forLabel?.slice(0, 60) || null,
      showLabel: input.showLabel ?? false,
      tags: (input.tags ?? []).slice(0, 10),
      // Intake text is kept only for signed-in owners (never for anonymous plans).
      intakeText: input.ownerId ? input.intakeText?.slice(0, 4000) || null : null,
      navigatorName: input.navigatorName?.slice(0, 40) || null,
      note: input.note?.slice(0, 1000) || null,
      expiresAt: input.ownerId ? null : new Date(now.getTime() + 365 * 86_400_000),
    });
  }
  if (input.items.length) {
    await db.insert(schema.planItems).values(
      input.items.slice(0, 40).map((it, i) => ({ planId: id!, serviceId: it.serviceId, tier: it.tier, note: it.note?.slice(0, 500) || null, position: i })),
    );
  }
  return { id: id!, shareToken };
}

async function withItems(p: typeof schema.plans.$inferSelect): Promise<Plan> {
  const items = await getDb().select().from(schema.planItems).where(eq(schema.planItems.planId, p.id)).orderBy(asc(schema.planItems.position));
  return { ...p, items };
}

export async function getPlanByToken(t: string): Promise<Plan | null> {
  const [p] = await getDb().select().from(schema.plans).where(eq(schema.plans.shareToken, t));
  if (!p || (p.expiresAt && p.expiresAt < new Date())) return null;
  return withItems(p);
}

export async function getPlanForOwner(id: string, ownerId: string): Promise<Plan | null> {
  const [p] = await getDb().select().from(schema.plans).where(and(eq(schema.plans.id, id), eq(schema.plans.ownerId, ownerId)));
  return p ? withItems(p) : null;
}

export async function listPlans(ownerId: string) {
  const db = getDb();
  const plans = await db.select().from(schema.plans).where(eq(schema.plans.ownerId, ownerId)).orderBy(desc(schema.plans.updatedAt));
  const items = await db.select().from(schema.planItems);
  const counts = new Map<string, number>();
  for (const it of items) counts.set(it.planId, (counts.get(it.planId) ?? 0) + 1);
  return plans.map((p) => ({ ...p, itemCount: counts.get(p.id) ?? 0 }));
}

export async function deletePlan(id: string, ownerId: string) {
  await getDb().delete(schema.plans).where(and(eq(schema.plans.id, id), eq(schema.plans.ownerId, ownerId)));
}
