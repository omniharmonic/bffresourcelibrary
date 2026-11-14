import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { requireRole } from "@/lib/session";
import { getDb, schema } from "@/lib/db";
import { getCatalog } from "@/lib/catalog";

export const metadata = { title: "My suggestions" };

const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "Waiting for review", cls: "later-today" },
  approved: { label: "Approved — it’s live", cls: "open" },
  rejected: { label: "Not used", cls: "closed" },
};

export default async function Suggestions({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const u = await requireRole("volunteer", "/suggestions");
  const { msg } = await searchParams;
  const [rows, c] = await Promise.all([
    getDb().select().from(schema.changeRequests).where(eq(schema.changeRequests.proposedBy, u.id)).orderBy(desc(schema.changeRequests.createdAt)).limit(100),
    getCatalog({ fresh: true }),
  ]);
  return (
    <div className="narrow" style={{ margin: "0 auto" }}>
      <h1 className="page-title">My suggestions</h1>
      {msg === "new" && <div className="ok">Thank you! Your new service was sent to Libby for review.</div>}
      <p className="muted">Every change you suggest shows up here. Libby or a BFF admin reviews them — usually within a few days.</p>
      {!rows.length && (
        <div className="panel">
          <p style={{ margin: 0 }}>
            Nothing yet. When you notice something’s out of date, open the service and tap <b>Is this still right?</b> — or{" "}
            <Link href="/services/new">add a new service</Link>.
          </p>
        </div>
      )}
      <ul className="list">
        {rows.map((r) => {
          const svc = r.serviceId ? c.serviceMap.get(r.serviceId) : undefined;
          const name = svc?.name ?? ((r.payload as { fields?: { name?: string } }).fields?.name || "New service");
          const st = STATUS[r.status] ?? { label: r.status, cls: "closed" };
          return (
            <li key={r.id}>
              <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                {svc ? (
                  <Link href={`/services/${svc.id}`} style={{ fontWeight: 700 }}>
                    {name}
                  </Link>
                ) : (
                  <b>{name}</b>
                )}
                <span className={`status ${st.cls}`}>{st.label}</span>
              </div>
              <div className="small muted">
                {r.kind === "create" ? "New service" : r.kind === "archive" ? "Reported closed" : "Update"} · {new Date(r.createdAt).toLocaleDateString()}
                {r.summary ? ` · ${r.summary}` : ""}
              </div>
              {r.reviewNote && (
                <div className="small" style={{ marginTop: 4 }}>
                  <b>Note from reviewer:</b> {r.reviewNote}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
