"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/session";
import { getCatalog } from "@/lib/catalog";
import { SERVICE_FIELDS } from "@/lib/fields";
import { applyServiceChange, createChangeRequest, approveChangeRequest, rejectChangeRequest, markVerified, setLockedFields, type ChangePayload } from "@/lib/services";
import { setSetting } from "@/lib/settings";
import { getDb, schema } from "@/lib/db";

function readPayload(fd: FormData, current?: Record<string, unknown> & { categories?: string[] }): ChangePayload {
  const fields: Record<string, string | null> = {};
  for (const f of SERVICE_FIELDS) {
    if (!fd.has(f.key)) continue;
    const v = String(fd.get(f.key) ?? "").trim();
    const cur = (current?.[f.key] as string | null | undefined) ?? "";
    if (!current || v !== cur) fields[f.key] = v || null;
  }
  const payload: ChangePayload = { fields };
  const cats = fd.getAll("categories").map(String);
  if (!current || [...cats].sort().join() !== [...(current.categories ?? [])].sort().join()) payload.categories = cats;
  const status = String(fd.get("status") ?? "");
  if (status && status !== current?.status) payload.status = status;
  const preferred = fd.get("preferred") === "on";
  if (fd.has("preferredField") && preferred !== !!current?.preferred) payload.preferred = preferred;
  for (const k of ["startsAt", "endsAt"] as const) {
    if (!fd.has(k)) continue;
    const v = String(fd.get(k) ?? "");
    const curV = current?.[k] ? new Date(current[k] as string).toISOString().slice(0, 10) : "";
    if (v !== curV) payload[k] = v || null;
  }
  return payload;
}

const isEmpty = (p: ChangePayload) =>
  !Object.keys(p.fields ?? {}).length && !p.categories && p.status === undefined && p.preferred === undefined && p.startsAt === undefined && p.endsAt === undefined;

export async function proposeService(fd: FormData) {
  const u = await requireRole("volunteer");
  const serviceId = String(fd.get("serviceId") ?? "") || null;
  const c = await getCatalog();
  const current = serviceId ? c.serviceMap.get(serviceId) : undefined;
  const payload = readPayload(fd, current as never);
  const why = String(fd.get("why") ?? "").slice(0, 500);
  if (!serviceId && !payload.fields?.name) throw new Error("Name is required");
  if (serviceId && isEmpty(payload)) redirect(`/services/${serviceId}?msg=nochange`);
  const kind = serviceId ? (fd.get("archive") === "on" ? "archive" : "update") : "create";
  if (u.role === "admin") {
    const id = await applyServiceChange({ kind, serviceId, payload, actor: `admin:${u.id}`, status: "active" });
    await createChangeRequest({ kind, serviceId: id, payload: payload as never, summary: why || "Admin edit", source: "admin", proposedBy: u.id }).then((cr) =>
      getDb().update(schema.changeRequests).set({ status: "approved", reviewerId: u.id, reviewedAt: new Date() }).where(eq(schema.changeRequests.id, cr.id)),
    );
    revalidatePath("/services");
    redirect(`/services/${id}?msg=saved`);
  }
  await createChangeRequest({ kind, serviceId, payload: payload as never, summary: why || undefined, source: "volunteer", proposedBy: u.id });
  redirect(serviceId ? `/services/${serviceId}?msg=proposed` : `/services?msg=proposed`);
}

export async function verifyServiceAction(fd: FormData) {
  const u = await requireRole("volunteer");
  const id = String(fd.get("serviceId"));
  await markVerified(id, u.id, String(fd.get("note") ?? "").slice(0, 200) || `Verified in person by ${u.displayName || u.name}`);
  revalidatePath(`/services/${id}`);
  redirect(`/services/${id}?msg=verified`);
}

export async function setLocksAction(fd: FormData) {
  await requireRole("admin");
  const id = String(fd.get("serviceId"));
  await setLockedFields(id, fd.getAll("locked").map(String));
  redirect(`/services/${id}?msg=locks`);
}

export async function reviewAction(fd: FormData) {
  const u = await requireRole("admin");
  const id = Number(fd.get("id"));
  const note = String(fd.get("note") ?? "").slice(0, 500) || undefined;
  if (fd.get("decision") === "approve") await approveChangeRequest(id, u.id, note);
  else await rejectChangeRequest(id, u.id, note);
  revalidatePath("/admin");
  revalidatePath("/", "layout");
}

export async function setUserRoleAction(fd: FormData) {
  const admin = await requireRole("admin");
  const id = String(fd.get("userId"));
  const decision = String(fd.get("decision"));
  if (id === admin.id && decision !== "admin") return; // don't demote yourself
  const patch =
    decision === "approve" ? { role: "volunteer", volunteerStatus: "approved" }
    : decision === "reject" ? { role: "participant", volunteerStatus: "rejected" }
    : decision === "admin" ? { role: "admin", volunteerStatus: "approved" }
    : { role: "participant", volunteerStatus: "none" };
  await getDb().update(schema.user).set({ ...patch, updatedAt: new Date() }).where(eq(schema.user.id, id));
  revalidatePath("/admin");
}

export async function settingsAction(fd: FormData) {
  await requireRole("admin");
  await setSetting("participant_mode", fd.get("participant_mode") === "on");
  await setSetting("ai_assist", fd.get("ai_assist") === "on");
  revalidatePath("/", "layout");
  redirect("/admin?tab=settings&msg=saved");
}

export async function saveGapAction(fd: FormData) {
  await requireRole("volunteer");
  const id = Number(fd.get("id") || 0);
  const v = {
    kind: String(fd.get("kind") || "gap"),
    title: String(fd.get("title") ?? "").trim().slice(0, 200),
    ideas: String(fd.get("ideas") ?? "").trim().slice(0, 2000) || null,
    owner: String(fd.get("owner") ?? "").trim().slice(0, 80) || null,
    status: String(fd.get("status") || "Not started"),
    updatedAt: new Date(),
  };
  if (!v.title) return;
  const db = getDb();
  if (fd.get("delete") === "on" && id) await db.delete(schema.gaps).where(eq(schema.gaps.id, id));
  else if (id) await db.update(schema.gaps).set(v).where(eq(schema.gaps.id, id));
  else await db.insert(schema.gaps).values(v);
  revalidatePath("/gaps");
  redirect("/gaps");
}

export async function bulkReviewAction(fd: FormData) {
  const u = await requireRole("admin");
  const source = String(fd.get("source"));
  const decision = String(fd.get("decision"));
  const rows = await getDb().select().from(schema.changeRequests).where(eq(schema.changeRequests.status, "pending"));
  for (const r of rows.filter((x) => x.source === source)) {
    if (decision === "approve") await approveChangeRequest(r.id, u.id, "Bulk approved");
    else await rejectChangeRequest(r.id, u.id, "Bulk rejected");
  }
  revalidatePath("/", "layout");
  redirect("/admin?tab=review");
}
