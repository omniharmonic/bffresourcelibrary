import Link from "next/link";
import { requireRole } from "@/lib/session";
import { getCatalog } from "@/lib/catalog";
import { normalize } from "@/lib/text";

export const metadata = { title: "Services" };

export default async function Services({ searchParams }: { searchParams: Promise<{ q?: string; cat?: string; status?: string; msg?: string }> }) {
  await requireRole("volunteer", "/services");
  const { q = "", cat = "", status = "", msg } = await searchParams;
  const c = await getCatalog({ fresh: true });
  const nq = normalize(q);
  const list = c.services.filter(
    (s) =>
      (!cat || s.categories.includes(cat)) &&
      (status ? s.status === status : s.status !== "inactive") &&
      (!nq || normalize([s.name, s.organization, s.summary, s.access, s.fieldNotes].join(" ")).includes(nq)),
  );
  return (
    <>
      <div className="btn-row" style={{ justifyContent: "space-between" }}>
        <h1 className="page-title" style={{ margin: 0 }}>Services</h1>
        <Link className="btn btn-primary" href="/services/new">
          + Add a service
        </Link>
      </div>
      {msg === "proposed" && <div className="ok">Thanks! Your new service was sent for review.</div>}
      <form className="panel" style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", marginTop: 16 }}>
        <input type="search" name="q" defaultValue={q} placeholder="Search" />
        <select name="cat" defaultValue={cat}>
          <option value="">All categories</option>
          {c.categories.map((x) => (
            <option key={x.slug} value={x.slug}>
              {x.name}
            </option>
          ))}
        </select>
        <select name="status" defaultValue={status}>
          <option value="">Active, pop-up & unreviewed</option>
          <option value="active">Active</option>
          <option value="temporary">Pop-up</option>
          <option value="unverified">Not yet reviewed (imported)</option>
          <option value="inactive">Closed / inactive</option>
        </select>
        <button className="btn">Filter</button>
      </form>
      <p className="muted small">{list.length} services</p>
      <ul className="list">
        {list.map((s) => (
          <li key={s.id}>
            <Link href={`/services/${s.id}`} style={{ fontWeight: 700, fontSize: 19 }}>
              {s.preferred ? "★ " : ""}
              {s.name}
            </Link>{" "}
            {s.status !== "active" && <span className={`status ${s.status === "unverified" ? "unverified" : "closed"}`}>{s.status}</span>}
            <div className="small muted">
              {s.categories.map((x) => c.categoryMap.get(x)?.name).filter(Boolean).join(" · ")}
              {s.verifiedAt ? ` · verified ${new Date(s.verifiedAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })}` : ""}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
