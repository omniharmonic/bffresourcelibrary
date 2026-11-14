import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole, hasRole } from "@/lib/session";
import { getCatalog } from "@/lib/catalog";
import { ServiceForm, TASKS, type EditTask } from "@/components/ServiceForm";

const TITLES: Record<EditTask, string> = {
  all: "Edit everything",
  hours: "Update the hours",
  place: "Update where it is",
  contact: "Update phone or website",
  note: "Add a field note",
  details: "Add “before you go” info",
  closed: "Report that it’s closed",
};

export default async function EditService({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ task?: string }> }) {
  const { id } = await params;
  const { task: t } = await searchParams;
  const task: EditTask = TASKS.some((x) => x.task === t) ? (t as EditTask) : "all";
  const u = await requireRole("volunteer", `/services/${id}/edit${t ? `?task=${t}` : ""}`);
  const c = await getCatalog({ fresh: true });
  const s = c.serviceMap.get(id);
  if (!s) notFound();
  return (
    <div className="narrow" style={{ margin: "0 auto" }}>
      <p>
        <Link href={`/services/${id}`}>← {s.name}</Link>
      </p>
      <h1 className="page-title">{TITLES[task]}</h1>
      <p className="muted" style={{ marginTop: -4 }}>{s.name}</p>
      <ServiceForm s={s} c={c} admin={hasRole(u, "admin")} task={task} />
    </div>
  );
}
