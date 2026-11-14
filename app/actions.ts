"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getCatalog, toMatchService, categoryInfos } from "@/lib/catalog";
import { match, type Filters } from "@/lib/match";
import { detectCrisis, type CrisisResult } from "@/lib/crisis";
import { getCurrentUser, hasRole } from "@/lib/session";
import { getSettings, aiAvailable } from "@/lib/settings";
import { classifyNeeds } from "@/lib/ai/jev";
import { toCard, type ServiceCard } from "@/lib/dto";
import { savePlan, deletePlan } from "@/lib/plans";
import { getDb, schema } from "@/lib/db";

export type FindResponse = {
  heard: { slug: string; name: string; score: number; reasons: string[] }[];
  tiers: Record<1 | 2 | 3, ServiceCard[]>;
  crisis: CrisisResult;
  usedAi: boolean;
  usedFallback: boolean;
  total: number;
};

export async function findServices(input: { text: string; chips: string[]; filters: Filters; mode: "volunteer" | "participant" }): Promise<FindResponse> {
  const user = await getCurrentUser();
  const settings = await getSettings();
  const volunteer = hasRole(user, "volunteer");
  if (input.mode === "participant" && !settings.participant_mode && !volunteer) throw new Error("Participant mode is off");
  const text = (input.text ?? "").slice(0, 4000);
  const c = await getCatalog();
  const crisis = detectCrisis(text);

  let ai: Record<string, number> | null = null;
  if (settings.ai_assist && aiAvailable() && text.trim().length > 8) {
    const r = await classifyNeeds(text, c.categories);
    if (r) {
      ai = r.categories;
      if (r.crisis >= 0.7 && crisis.level === "none") crisis.level = "concern";
    }
  }
  const filters: Filters = { ...input.filters, includeUnverified: volunteer && !!input.filters.includeUnverified };
  const services = c.services.filter((s) => volunteer || s.status !== "unverified").map(toMatchService);
  const r = match({ text, chips: input.chips?.slice(0, 20), ai, filters }, { terms: c.terms, services, categories: categoryInfos(c) });

  const tiers: FindResponse["tiers"] = { 1: [], 2: [], 3: [] };
  for (const t of [1, 2, 3] as const) {
    tiers[t] = r.byTier[t].slice(0, 12).map((x) => toCard(c.serviceMap.get(x.service.id)!, c, { volunteer, tier: t, reasons: x.reasons }));
  }
  return {
    heard: r.categories.slice(0, 10).map((x) => ({ slug: x.slug, name: c.categoryMap.get(x.slug)?.name ?? x.slug, score: x.score, reasons: x.reasons })),
    tiers,
    crisis,
    usedAi: !!ai,
    usedFallback: r.usedFallback,
    total: r.results.length,
  };
}

export async function getCards(ids: string[]): Promise<ServiceCard[]> {
  const user = await getCurrentUser();
  const c = await getCatalog();
  return ids.map((id) => c.serviceMap.get(id)).filter(Boolean).map((s) => toCard(s!, c, { volunteer: hasRole(user, "volunteer") }));
}

export async function cardsForCategories(slugs: string[]): Promise<ServiceCard[]> {
  const user = await getCurrentUser();
  const volunteer = hasRole(user, "volunteer");
  const c = await getCatalog();
  const set = new Set(slugs);
  return c.services
    .filter((s) => s.status !== "inactive" && (volunteer || s.status !== "unverified") && s.categories.some((x) => set.has(x)))
    .sort((a, b) => Number(b.preferred) - Number(a.preferred) || a.name.localeCompare(b.name))
    .map((s) => toCard(s, c, { volunteer, tier: Math.min(...s.categories.filter((x) => set.has(x)).map((x) => c.categoryMap.get(x)?.tier ?? 2)) }));
}

export type PlanDraft = {
  planId?: string | null;
  items: { serviceId: string; tier: number; note?: string }[];
  forLabel?: string;
  showLabel?: boolean;
  tags?: string;
  navigatorName?: string;
  note?: string;
  intakeText?: string;
};

export async function savePlanAction(draft: PlanDraft): Promise<{ token: string; id: string }> {
  const user = await getCurrentUser();
  const c = await getCatalog();
  const items = draft.items.filter((i) => c.serviceMap.has(i.serviceId)).map((i) => ({ ...i, tier: Math.min(Math.max(i.tier, 1), 3) }));
  if (!items.length) throw new Error("Add at least one service to the plan.");
  const res = await savePlan({
    planId: user ? draft.planId : null,
    ownerId: user?.id ?? null,
    forLabel: draft.forLabel?.trim(),
    showLabel: !!draft.showLabel,
    tags: (draft.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean),
    navigatorName: draft.navigatorName?.trim(),
    note: draft.note?.trim(),
    intakeText: draft.intakeText,
    items,
  });
  revalidatePath("/plans");
  return { token: res.shareToken, id: res.id };
}

export async function deletePlanAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await deletePlan(String(formData.get("id")), user.id);
  revalidatePath("/plans");
}

export async function requestVolunteerAccess(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/access");
  const displayName = String(formData.get("displayName") ?? "").slice(0, 60);
  await getDb()
    .update(schema.user)
    .set({ volunteerStatus: user.role === "participant" ? "requested" : user.volunteerStatus, displayName: displayName || null, updatedAt: new Date() })
    .where(eq(schema.user.id, user.id));
  revalidatePath("/access");
}
