import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { requireRole, hasRole } from "@/lib/session";
import { getCatalog } from "@/lib/catalog";
import { toCard } from "@/lib/dto";
import { getDb, schema } from "@/lib/db";
import { SERVICE_FIELDS, FIELD_LABEL } from "@/lib/fields";
import { ServiceCardView } from "@/components/ServiceCardView";
import { TASKS } from "@/components/ServiceForm";
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
  proposed: "Thank you! Your change was sent to Libby for review. You can follow it under “My suggestions”.",
  saved: "Saved — it’s live now.",
  verified: "Thanks for checking! It’s marked as verified today.",
  locks: "Field locks updated.",
  nochange: "Nothing was different, so nothing was sent.",
};

export default async function ServicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string }> }) {
  const { id } = await params;
  const { msg } = await searchParams;
  const u = await requireRole("volunteer", `/services/${id}`);
  const c = await getCatalog({ fresh: true });
  const s = c.serviceMap.get(id);
  if (!s) notFound();
  const db = getDb();
  const [revs, requests] = await Promise.all([
    db.select().from(schema.serviceRevisions).where(eq(schema.serviceRevisions.serviceId, id)).orderBy(desc(schema.serviceRevisions.createdAt)).limit(10),
    db.select().from(schema.changeRequests).where(eq(schema.changeRequests.serviceId, id)).orderBy(desc(schema.changeRequests.createdAt)).limit(10),
  ]);
  const pending = requests.filter((r) => r.status === "pending");
  const admin = hasRole(u, "admin");
  const sources = s.fieldSources ?? {};
  const verified = s.verifiedAt ? new Date(s.verifiedAt) : null;
  const days = verified ? Math.floor((Date.now() - verified.getTime()) / 86_400_000) : null;
  return (
    <div className="narrow" style={{ margin: "0 auto" }}>
      <p>
        <Link href="/services">← Services</Link>
      </p>
      {msg && MSG[msg] && (
        <div className="ok">
          {MSG[msg]} {msg === "proposed" && <Link href="/suggestions">My suggestions →</Link>}
        </div>
      )}
      <ServiceCardView s={toCard(s, c, { volunteer: true })} volunteer />

      <section className="panel still-right" aria-labelledby="still-right">
        <h2 id="still-right" style={{ fontSize: 24 }}>
          Is this still right?
        </h2>
        <p className="muted small" style={{ marginTop: -4 }}>
          {verified ? `Last checked by a person ${days === 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`}.` : "No one has checked this in person yet."}
          {pending.length > 0 && ` ${pending.length} suggested ${pending.length === 1 ? "change is" : "changes are"} waiting for review.`}
        </p>
        <form action={verifyServiceAction}>
          <input type="hidden" name="serviceId" value={id} />
          <button className="btn btn-primary btn-block">✓ Yes — I checked this today</button>
        </form>
        <div className="eyebrow" style={{ margin: "18px 0 8px" }}>
          Something’s different? Tell us what:
        </div>
        <div className="task-grid">
          {TASKS.map((t) => (
            <Link key={t.task} className="task" href={`/services/${id}/edit?task=${t.task}`}>
              <span className="task-ico" aria-hidden>
                {t.icon}
              </span>
              <span>
                <b>{t.label}</b>
                <span className="muted small" style={{ display: "block" }}>
                  {t.blurb}
                </span>
              </span>
            </Link>
          ))}
        </div>
        <p style={{ margin: "14px 0 0" }}>
          <Link href={`/services/${id}/edit`}>{admin ? "Edit everything" : "Edit everything (all fields)"} →</Link>
        </p>
      </section>

      {pending.length > 0 && (
        <section className="panel">
          <h3>Waiting for review</h3>
          <ul className="list">
            {pending.map((p) => (
              <li key={p.id} className="small">
                {p.summary || "Suggested change"} <span className="muted">· {new Date(p.createdAt).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <details className="panel">
        <summary style={{ cursor: "pointer", fontWeight: 700 }}>Where this info came from</summary>
        <table className="t" style={{ marginTop: 10 }}>
          <tbody>
            {Object.entries(sources).map(([k, v]) => (
              <tr key={k}>
                <td>{FIELD_LABEL[k] ?? k.replace(/^details\./, "")}</td>
                <td className="small">{sourceLabel(v.source)}</td>
                <td className="small muted">{new Date(v.at).toLocaleDateString()}</td>
                <td style={{ width: 30 }}>{(s.lockedFields ?? []).includes(k) ? "🔒" : ""}</td>
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
        <h3 style={{ marginTop: 18 }}>History</h3>
        <ul className="list">
          {revs.map((r) => (
            <li key={r.id} className="small">
              {new Date(r.createdAt).toLocaleString("en-US", { timeZone: "America/Denver" })} · {sourceLabel(r.actor)}
              {r.changeRequestId ? ` · change #${r.changeRequestId}` : ""}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
