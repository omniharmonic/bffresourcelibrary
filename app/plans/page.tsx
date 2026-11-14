import Link from "next/link";
import { requireUser } from "@/lib/session";
import { listPlans } from "@/lib/plans";
import { deletePlanAction } from "@/app/actions";

export const metadata = { title: "My plans" };

export default async function Plans({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const u = await requireUser("/plans");
  const { q = "" } = await searchParams;
  const all = await listPlans(u.id);
  const needle = q.toLowerCase();
  const plans = needle ? all.filter((p) => [p.forLabel, ...(p.tags ?? []), p.note].join(" ").toLowerCase().includes(needle)) : all;
  return (
    <>
      <h1 className="page-title">My plans</h1>
      <form className="btn-row" style={{ marginBottom: 16 }}>
        <input type="search" name="q" defaultValue={q} placeholder="Search by nickname or tag" style={{ maxWidth: 360 }} />
        <button className="btn">Search</button>
      </form>
      {!plans.length && <p className="muted">No saved plans yet.</p>}
      <ul className="list">
        {plans.map((p) => (
          <li key={p.id} style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <Link href={`/p/${p.shareToken}`} style={{ fontWeight: 700, fontSize: 20 }}>
                {p.forLabel || "Untitled plan"}
              </Link>
              <div className="small muted">
                {p.itemCount} services · {new Date(p.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Denver" })}
                {p.tags?.length ? ` · ${p.tags.join(", ")}` : ""}
              </div>
            </div>
            <form action={deletePlanAction}>
              <input type="hidden" name="id" value={p.id} />
              <button className="btn btn-sm btn-danger">Delete</button>
            </form>
          </li>
        ))}
      </ul>
    </>
  );
}
