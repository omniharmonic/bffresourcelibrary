import { eq, and } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { getDb, schema } from "./db";
import { FIELD_KEYS } from "./fields";
import { parseHours } from "./hours";
import { stampSources } from "./provenance";
import { invalidateCatalog } from "./catalog";
import { mergeDetails } from "./details";

export type ChangePayload = {
  fields?: Record<string, string | number | null>;
  categories?: string[];
  status?: string;
  preferred?: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  /** Structured facts (lib/details.ts), merged into services.details; null clears a key. */
  details?: Record<string, unknown>;
};

export const newServiceId = () => "s_" + randomBytes(5).toString("hex");

type Svc = typeof schema.services.$inferSelect;

function snapshot(s: Svc, categories: string[]) {
  return { ...s, categories } as Record<string, unknown>;
}

/** Apply a change directly (used by admins, approvals, seed and feeds). Returns the service id. */
export async function applyServiceChange(opts: {
  kind: "create" | "update" | "archive";
  serviceId?: string | null;
  payload: ChangePayload;
  actor: string; // "admin:<uid>", "volunteer:<uid>", "feed:<id>", "seed:bff"
  changeRequestId?: number | null;
  status?: string; // for create
  externalIds?: Record<string, string>;
}): Promise<string> {
  const db = getDb();
  const now = new Date();
  const fields = Object.fromEntries(
    Object.entries(opts.payload.fields ?? {}).filter(([k]) => FIELD_KEYS.includes(k as never) || k === "lat" || k === "lng"),
  );
  for (const k of Object.keys(fields)) if (fields[k] === "") fields[k] = null;

  let id = opts.serviceId ?? null;
  let existing: Svc | undefined;
  if (id) [existing] = await db.select().from(schema.services).where(eq(schema.services.id, id));
  const merged = opts.payload.details ? mergeDetails(existing?.details, opts.payload.details) : null;
  const detailKeys = (merged?.changed ?? []).map((k) => `details.${k}`);

  if (opts.kind === "create" || !existing) {
    id = id ?? newServiceId();
    const hours = (fields.hoursText as string) || (fields.access as string) || "";
    await db.insert(schema.services).values({
      id,
      name: String(fields.name ?? "Untitled service"),
      ...(fields as Record<string, never>),
      schedule: parseHours(hours),
      status: opts.payload.status ?? opts.status ?? "active",
      preferred: opts.payload.preferred ?? false,
      startsAt: opts.payload.startsAt ? new Date(opts.payload.startsAt) : null,
      endsAt: opts.payload.endsAt ? new Date(opts.payload.endsAt) : null,
      ...(merged ? { details: merged.details } : {}),
      fieldSources: stampSources({}, [...Object.keys(fields), ...detailKeys], opts.actor, now),
      externalIds: opts.externalIds ?? {},
      lastSeenAt: opts.actor.startsWith("feed:") ? now : null,
    });
  } else {
    const patch: Partial<Svc> = { ...(fields as Partial<Svc>), updatedAt: now };
    if ("hoursText" in fields || "access" in fields) {
      const hours = (("hoursText" in fields ? fields.hoursText : existing.hoursText) as string) || ((("access" in fields ? fields.access : existing.access) as string) ?? "");
      patch.schedule = parseHours(hours);
    }
    if (opts.kind === "archive") patch.status = "inactive";
    if (opts.payload.status) patch.status = opts.payload.status;
    if (opts.payload.preferred !== undefined) patch.preferred = opts.payload.preferred;
    if (opts.payload.startsAt !== undefined) patch.startsAt = opts.payload.startsAt ? new Date(opts.payload.startsAt) : null;
    if (opts.payload.endsAt !== undefined) patch.endsAt = opts.payload.endsAt ? new Date(opts.payload.endsAt) : null;
    if (merged) patch.details = merged.details;
    patch.fieldSources = stampSources(existing.fieldSources ?? {}, [...Object.keys(fields), ...detailKeys], opts.actor, now);
    if (opts.externalIds) patch.externalIds = { ...(existing.externalIds ?? {}), ...opts.externalIds };
    await db.update(schema.services).set(patch).where(eq(schema.services.id, id!));
  }

  if (opts.payload.categories) {
    await db.delete(schema.serviceCategories).where(eq(schema.serviceCategories.serviceId, id!));
    const cats = [...new Set(opts.payload.categories)];
    if (cats.length) await db.insert(schema.serviceCategories).values(cats.map((c) => ({ serviceId: id!, categorySlug: c })));
  }

  const [after] = await db.select().from(schema.services).where(eq(schema.services.id, id!));
  const cats = (await db.select().from(schema.serviceCategories).where(eq(schema.serviceCategories.serviceId, id!))).map((c) => c.categorySlug);
  await db.insert(schema.serviceRevisions).values({
    serviceId: id!,
    snapshot: snapshot(after, cats),
    changeRequestId: opts.changeRequestId ?? null,
    actor: opts.actor,
  });
  invalidateCatalog();
  return id!;
}

export async function createChangeRequest(cr: {
  kind: "create" | "update" | "archive" | "notice";
  serviceId?: string | null;
  payload: ChangePayload | Record<string, unknown>;
  summary?: string;
  source: string;
  proposedBy?: string | null;
}) {
  const db = getDb();
  const [row] = await db
    .insert(schema.changeRequests)
    .values({
      kind: cr.kind,
      serviceId: cr.serviceId ?? null,
      payload: cr.payload as Record<string, unknown>,
      summary: cr.summary ?? null,
      source: cr.source,
      proposedBy: cr.proposedBy ?? null,
    })
    .returning();
  return row;
}

export async function approveChangeRequest(id: number, reviewerId: string, note?: string, override?: ChangePayload) {
  const db = getDb();
  const [cr] = await db.select().from(schema.changeRequests).where(and(eq(schema.changeRequests.id, id), eq(schema.changeRequests.status, "pending")));
  if (!cr) throw new Error("Change request not found or already reviewed");
  let serviceId = cr.serviceId;
  if (cr.kind !== "notice") {
    const actor = cr.source === "volunteer" || cr.source === "admin" ? `volunteer:${cr.proposedBy}` : cr.source.startsWith("feed:") ? cr.source : `admin:${reviewerId}`;
    serviceId = await applyServiceChange({
      kind: cr.kind as "create" | "update" | "archive",
      serviceId: cr.serviceId,
      payload: override ?? (cr.payload as ChangePayload),
      actor,
      changeRequestId: cr.id,
      status: "active",
    });
  }
  await db
    .update(schema.changeRequests)
    .set({ status: "approved", reviewerId, reviewNote: note ?? null, reviewedAt: new Date(), serviceId })
    .where(eq(schema.changeRequests.id, id));
  return serviceId;
}

export async function rejectChangeRequest(id: number, reviewerId: string, note?: string) {
  const db = getDb();
  const [cr] = await db.select().from(schema.changeRequests).where(eq(schema.changeRequests.id, id));
  // Rejecting an imported, never-reviewed place hides it for good (the feed won't resurrect it: matched by external id).
  if (cr?.serviceId && cr.source.startsWith("feed:") && (cr.payload as ChangePayload).status === "active") {
    await db.update(schema.services).set({ status: "inactive" }).where(and(eq(schema.services.id, cr.serviceId), eq(schema.services.status, "unverified")));
    invalidateCatalog();
  }
  await db
    .update(schema.changeRequests)
    .set({ status: "rejected", reviewerId, reviewNote: note ?? null, reviewedAt: new Date() })
    .where(eq(schema.changeRequests.id, id));
}

export async function markVerified(serviceId: string, userId: string, note?: string) {
  await getDb()
    .update(schema.services)
    .set({ verifiedAt: new Date(), verifiedBy: userId, verificationNote: note || "Verified by a BFF volunteer", status: "active" })
    .where(eq(schema.services.id, serviceId));
  invalidateCatalog();
}

export async function setLockedFields(serviceId: string, fields: string[]) {
  await getDb().update(schema.services).set({ lockedFields: fields }).where(eq(schema.services.id, serviceId));
  invalidateCatalog();
}
