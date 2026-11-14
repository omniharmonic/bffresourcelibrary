import Link from "next/link";
import { requireRole, hasRole } from "@/lib/session";
import { getCatalog } from "@/lib/catalog";
import { ServiceForm } from "@/components/ServiceForm";

export const metadata = { title: "Add a service" };

export default async function NewService() {
  const u = await requireRole("volunteer", "/services/new");
  const c = await getCatalog({ fresh: true });
  return (
    <div className="narrow" style={{ margin: "0 auto" }}>
      <p>
        <Link href="/services">← Services</Link>
      </p>
      <h1 className="page-title">Add a service</h1>
      <p className="muted">Know a place that helps? Fill in what you can — only the name is required. Skip anything you’re not sure about.</p>
      <ServiceForm c={c} admin={hasRole(u, "admin")} />
    </div>
  );
}
