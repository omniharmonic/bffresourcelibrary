import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { requireRole, hasRole } from "@/lib/session";
import { getCatalog } from "@/lib/catalog";
import { toCard } from "@/lib/dto";
import { getDb, schema } from "@/lib/db";
import { SERVICE_FIELDS, FIELD_LABEL } from "@/lib/fields";
import { ServiceCardView } from "@/components/ServiceCardView";
import { verifyServiceAction, setLocksAction } from "@/app/wiki-actions";

function sourceLabel(src: string) {
  const [kind, rest] = [src.split(":")[0], src.split(":").slice(1).join(":")];
  if (kind === "seed") return "BFF original list";
  if (kind === "feed") return `Import: ${rest}`;
  if (kind === "volunteer") return "Volunteer edit";
  if (kind === "admin") return "Admin edit";
  return src;
}

const MSG: Record<string, string> = {
  proposed: "Thanks! Your edit was sent to an admin for review.",
  saved: "Saved.",
  verified: "Marked as verified today. Thank you!",
  locks: "Field locks updated.",
  nochange: "Nothing changed, so nothing was sent.",
};

export default async function ServicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string }> }) {
  const { id } = await params;
  const { msg } = await searchParams;
  const u = await requireRole("volunteer", `/services/${id}`);
  const c = await getCatalog({ fresh: true });
  const s = c.serviceMap.get(id);
  if (!s) notFound();
  const db = getDb();
  const [revs, pending] = await Promise.all([
    db.select().from(schema.serviceRevisions).where(eq(schema.serviceRevisions.serviceId, id)).orderBy(desc(schema.serviceRevisions.createdAt)).limit(10),
    db.select().from(schema.changeRequests).where(eq(schema.changeRequests.serviceId, id)).orderBy(desc(schema.changeRequests.createdAt)).limit(10),
  ]);
  const admin = hasRole(u, "admin");
  const sources = s.fieldSources ?? {};
  return (
    <div className="narrow">
      <p>
        <Link href="/services">← Services</Link>
      </p>
      {msg && MSG[msg] && <div className="ok">{MSG[msg]}</div>}
      <ServiceCardView s={toCard(s, c, { volunteer: true })} volunteer />
      <div className="btn-row" style={{ margin: "12px 0 24px" }}>
        <Link className="btn btn-primary" href={`/services/${id}/edit`}>
          ✎ {admin ? "Edit" : "Suggest an edit"}
        </Link>
        <form action={verifyServiceAction} className="btn-row">
          <input type="hidden" name="serviceId" value={id} />
          <button className="btn">✓ I checked this today</button>
        </form>
      </div>

      <section className="panel">
        <h3>Where each detail came from</h3>
        <table className="t">
          <tbody>
            {Object.entries(sources).map(([k, v]) => (
              <tr key={k}>
                <td>{FIELD_LABEL[k] ?? k}</td>
                <td className="small">{sourceLabel(v.source)}</td>
                <td className="small muted">{new Date(v.at).toLocaleDateString()}</td>
                <td>{(s.lockedFields ?? []).includes(k) ? "🔒" : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {admin && (
          <form action={setLocksAction} style={{ marginTop: 12 }}>
            <input type="hidden" name="serviceId" value={id} />
            <details>
              <summary className="btn btn-sm">🔒 Lock fields so imports can’t change them</summary>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0 16px", marginTop: 8 }}>
                {SERVICE_FIELDS.map((f) => (
                  <label className="check" key={f.key}>
                    <input type="checkbox" name="locked" value={f.key} defaultChecked={(s.lockedFields ?? []).includes(f.key)} /> {FIELD_LABEL[f.key]}
                  </label>
                ))}
              </div>
              <button className="btn btn-sm btn-dark">Save locks</button>
            </details>
          </form>
        )}
      </section>

      {pending.length > 0 && (
        <section className="panel">
          <h3>Suggested changes</h3>
          <ul className="list">
            {pending.map((p) => (
              <li key={p.id} className="small">
                <b>{p.status}</b> · {p.kind} · {p.source} · {new Date(p.createdAt).toLocaleDateString()}
                {p.summary ? ` — ${p.summary}` : ""}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="panel">
        <h3>History</h3>
        <ul className="list">
          {revs.map((r) => (
            <li key={r.id} className="small">
              {new Date(r.createdAt).toLocaleString("en-US", { timeZone: "America/Denver" })} · {r.actor.split(":")[0]}
              {r.changeRequestId ? ` · change #${r.changeRequestId}` : ""}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
