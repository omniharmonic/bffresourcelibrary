import { requireRole, hasRole } from "@/lib/session";
import { getCatalog } from "@/lib/catalog";
import { ServiceForm } from "@/components/ServiceForm";

export const metadata = { title: "Add a service" };

export default async function NewService() {
  const u = await requireRole("volunteer", "/services/new");
  const c = await getCatalog();
  return (
    <div className="narrow">
      <h1 className="page-title">Add a service</h1>
      <ServiceForm c={c} admin={hasRole(u, "admin")} />
    </div>
  );
}
