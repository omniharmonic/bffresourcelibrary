import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole, hasRole } from "@/lib/session";
import { getCatalog } from "@/lib/catalog";
import { ServiceForm } from "@/components/ServiceForm";

export default async function EditService({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await requireRole("volunteer", `/services/${id}/edit`);
  const c = await getCatalog({ fresh: true });
  const s = c.serviceMap.get(id);
  if (!s) notFound();
  return (
    <div className="narrow">
      <p>
        <Link href={`/services/${id}`}>← {s.name}</Link>
      </p>
      <h1 className="page-title">{hasRole(u, "admin") ? "Edit" : "Suggest an edit"}</h1>
      <ServiceForm s={s} c={c} admin={hasRole(u, "admin")} />
    </div>
  );
}
