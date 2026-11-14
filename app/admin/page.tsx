import Link from "next/link";
import { desc, eq, ne } from "drizzle-orm";
import { requireRole } from "@/lib/session";
import { getDb, schema } from "@/lib/db";
import { getCatalog } from "@/lib/catalog";
import { getSettings, aiAvailable } from "@/lib/settings";
import { FIELD_LABEL } from "@/lib/fields";
import { Evidence, labelFor, detailDisplay, type EvidenceItem, type EnrichPage } from "@/components/Evidence";
import { servicesNeedingFieldCheck } from "@/lib/enrich/verify-queue";
import { reviewAction, setUserRoleAction, settingsAction, bulkReviewAction } from "@/app/wiki-actions";

export const metadata = { title: "Admin" };

const TABS = [
  ["review", "Review queue"],
  ["people", "Volunteers"],
  ["settings", "Settings"],
  ["checks", "Field checks"],
  ["sources", "Data sources"],
] as const;

function show(v: unknown) {
  if (v === null || v === undefined || v === "") return <span className="muted">—</span>;
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
}

export default async function Admin({ searchParams }: { searchParams: Promise<{ tab?: string; msg?: string; src?: string }> }) {
  await requireRole("admin", "/admin");
  const { tab = "review", msg, src = "" } = await searchParams;
  const db = getDb();

  return (
    <>
      <h1 className="page-title">Admin</h1>
      <nav className="tabs" aria-label="Admin sections">
        {TABS.map(([k, label]) => (
          <Link key={k} href={`/admin?tab=${k}`} className="chip" aria-pressed={tab === k}>
            {label}
          </Link>
        ))}
      </nav>
      {msg === "saved" && <div className="ok">Saved.</div>}
      {tab === "review" && <Review src={src} />}
      {tab === "people" && <People />}
      {tab === "settings" && <SettingsTab />}
      {tab === "checks" && <Checks />}
      {tab === "sources" && <Sources />}
    </>
  );

  async function Review({ src }: { src: string }) {
    const c = await getCatalog({ fresh: true });
    const all = await db.select().from(schema.changeRequests).where(eq(schema.changeRequests.status, "pending")).orderBy(desc(schema.changeRequests.createdAt));
    const users = await db.select({ id: schema.user.id, name: schema.user.name, displayName: schema.user.displayName }).from(schema.user);
    const who = new Map(users.map((u) => [u.id, u.displayName || u.name]));
    const sources = [...new Set(all.map((r) => r.source))];
    const rows = src ? all.filter((r) => r.source === src) : all;
    return (
      <section>
        <p className="muted">
          {all.length} waiting. Volunteer suggestions, research suggestions and automatic imports all land here. Nothing changes for everyone until you approve it.
        </p>
        <div className="chips" style={{ marginBottom: 12 }}>
          <Link className="chip" href="/admin?tab=review" aria-pressed={!src}>
            All
          </Link>
          {sources.map((s) => (
            <Link key={s} className="chip" href={`/admin?tab=review&src=${encodeURIComponent(s)}`} aria-pressed={src === s}>
              {s} ({all.filter((r) => r.source === s).length})
            </Link>
          ))}
        </div>
        {src && src !== "volunteer" && rows.length > 1 && (
          <form action={bulkReviewAction} className="panel btn-row">
            <input type="hidden" name="source" value={src} />
            <span style={{ flex: 1 }}>
              All {rows.length} from <b>{src}</b>:
            </span>
            <button className="btn btn-sm btn-primary" name="decision" value="approve">
              Approve all
            </button>
            <button className="btn btn-sm btn-danger" name="decision" value="reject">
              Reject all
            </button>
          </form>
        )}
        {rows.slice(0, 60).map((r) => {
          const svc = r.serviceId ? c.serviceMap.get(r.serviceId) : undefined;
          const p = r.payload as { fields?: Record<string, unknown>; details?: Record<string, unknown>; categories?: string[]; status?: string; preferred?: boolean; url?: string; key?: string; evidence?: Record<string, EvidenceItem>; page?: EnrichPage; conflicts?: unknown[] };
          return (
            <article className="card" key={r.id} style={{ marginBottom: 14 }}>
              <div className="eyebrow">
                #{r.id} · {r.kind} · {r.source}
                {r.proposedBy ? ` · ${who.get(r.proposedBy) ?? "volunteer"}` : ""} · {new Date(r.createdAt).toLocaleDateString()}
              </div>
              <h3 style={{ marginBottom: 6 }}>
                {svc ? <Link href={`/services/${svc.id}`}>{svc.name}</Link> : (p.fields?.name as string) ?? "Notice"}
                {svc?.status === "unverified" && <span className="status unverified" style={{ marginLeft: 8 }}>imported</span>}
              </h3>
              {r.summary && <p className="small">{r.summary}</p>}
              {r.kind === "notice" && p.url && (
                <p>
                  <a href={p.url} target="_blank" rel="noreferrer">
                    {r.source.startsWith("enrich:") ? "Open the provider’s page" : "Open the document"}
                  </a>{" "}
                  — compare it with our record, then mark this done.
                </p>
              )}
              {(p.fields || p.details || p.categories || p.status !== undefined || p.preferred !== undefined) && (
                <div className="diff" style={{ margin: "8px 0" }}>
                  {Object.entries(p.fields ?? {}).map(([k, v]) => (
                    <FieldRow key={k} label={FIELD_LABEL[k] ?? k} old={svc ? (svc as Record<string, unknown>)[k] : undefined} next={v} isCreate={!svc} />
                  ))}
                  {p.categories && (
                    <FieldRow
                      label="Categories"
                      old={svc?.categories.map((x) => c.categoryMap.get(x)?.name ?? x)}
                      next={p.categories.map((x) => c.categoryMap.get(x)?.name ?? x)}
                      isCreate={!svc}
                    />
                  )}
                  {Object.entries(p.details ?? {}).map(([k, v]) => (
                    <FieldRow
                      key={"d-" + k}
                      label={labelFor(k)}
                      old={svc ? detailDisplay(k, (svc.details as Record<string, unknown> | null)?.[k]) : undefined}
                      next={detailDisplay(k, v)}
                      isCreate={!svc}
                    />
                  ))}
                  {p.status !== undefined && <FieldRow label="Status" old={svc?.status} next={p.status} isCreate={!svc} />}
                  {p.preferred !== undefined && <FieldRow label="BFF preferred" old={svc?.preferred ? "yes" : "no"} next={p.preferred ? "yes" : "no"} isCreate={!svc} />}
                </div>
              )}
              {(p.evidence || p.page) && <Evidence evidence={p.evidence ?? {}} page={p.page} conflicts={p.conflicts} />}
              <form action={reviewAction} className="btn-row" style={{ marginTop: 8 }}>
                <input type="hidden" name="id" value={r.id} />
                <input type="text" name="note" placeholder="Note (optional)" style={{ flex: 1, minWidth: 180 }} aria-label="Review note" />
                <button className="btn btn-sm btn-primary" name="decision" value="approve">
                  {r.kind === "notice" ? "Mark done" : "Approve"}
                </button>
                <button className="btn btn-sm btn-danger" name="decision" value="reject">
                  {r.kind === "notice" ? "Dismiss" : "Reject"}
                </button>
              </form>
            </article>
          );
        })}
        {rows.length > 60 && <p className="muted">Showing 60 of {rows.length}. Filter by source above.</p>}
        {!rows.length && <div className="ok">All caught up. 🎉</div>}
      </section>
    );
  }

  async function People() {
    const users = await db.select().from(schema.user).where(ne(schema.user.volunteerStatus, "none")).orderBy(desc(schema.user.updatedAt));
    const requested = users.filter((u) => u.volunteerStatus === "requested");
    const others = users.filter((u) => u.volunteerStatus !== "requested");
    const Row = ({ u }: { u: (typeof users)[number] }) => (
      <tr>
        <td>
          <b>{u.displayName || u.name}</b>
          <div className="small muted">{u.email}</div>
        </td>
        <td>{u.role}</td>
        <td>
          <form action={setUserRoleAction} className="btn-row">
            <input type="hidden" name="userId" value={u.id} />
            {u.role !== "volunteer" && (
              <button className="btn btn-sm btn-primary" name="decision" value="approve">
                Approve volunteer
              </button>
            )}
            {u.role !== "admin" && (
              <button className="btn btn-sm" name="decision" value="admin">
                Make admin
              </button>
            )}
            {u.volunteerStatus === "requested" ? (
              <button className="btn btn-sm btn-danger" name="decision" value="reject">
                Reject
              </button>
            ) : (
              u.role !== "participant" && (
                <button className="btn btn-sm btn-danger" name="decision" value="revoke">
                  Remove access
                </button>
              )
            )}
          </form>
        </td>
      </tr>
    );
    return (
      <section className="panel">
        <h2>Waiting for approval ({requested.length})</h2>
        {requested.length ? (
          <table className="t">
            <tbody>
              {requested.map((u) => (
                <Row key={u.id} u={u} />
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted">No one is waiting.</p>
        )}
        <h2 style={{ marginTop: 24 }}>Volunteers & admins</h2>
        <table className="t">
          <tbody>
            {others.map((u) => (
              <Row key={u.id} u={u} />
            ))}
          </tbody>
        </table>
        <p className="small muted">New volunteers sign in with their email, then tap “I’m a BFF volunteer” to request access.</p>
      </section>
    );
  }

  async function SettingsTab() {
    const s = await getSettings();
    return (
      <form action={settingsAction} className="panel stack">
        <label className="check" style={{ alignItems: "flex-start" }}>
          <input type="checkbox" name="participant_mode" defaultChecked={s.participant_mode} />
          <span>
            <b>Participant mode</b>
            <span className="hint" style={{ display: "block" }}>
              Lets anyone (no account needed) use “I need help” to describe their needs and build their own plan. Off: they see where to meet a navigator instead.
            </span>
          </span>
        </label>
        <label className="check" style={{ alignItems: "flex-start" }}>
          <input type="checkbox" name="ai_assist" defaultChecked={s.ai_assist} disabled={!aiAvailable()} />
          <span>
            <b>AI assist (TypeSafe Jev)</b>
            <span className="hint" style={{ display: "block" }}>
              {aiAvailable()
                ? "Improves matching for free-text descriptions. Names, phones and addresses are removed before sending. It can only choose from our categories; it never writes advice or invents services."
                : "Not configured: add a TYPESAFE_API_KEY to the server to enable."}
            </span>
          </span>
        </label>
        <div>
          <button className="btn btn-primary">Save settings</button>
        </div>
      </form>
    );
  }

  async function Checks() {
    const items = await servicesNeedingFieldCheck({ limit: 25 });
    return (
      <section className="panel">
        <h2>Needs a field check</h2>
        <p className="muted small">
          The services people rely on most that haven’t been checked in person lately, or are missing key facts. A quick call or visit,
          then “I checked this today”, keeps the navigator trustworthy.
        </p>
        <ol className="list" style={{ paddingLeft: 0 }}>
          {items.map((i) => (
            <li key={i.serviceId}>
              <Link href={`/services/${i.serviceId}`} style={{ fontWeight: 700 }}>
                {i.name}
              </Link>
              <div className="small muted">{i.reason}</div>
            </li>
          ))}
        </ol>
      </section>
    );
  }

  async function Sources() {
    const runs = await db.select().from(schema.ingestRuns).orderBy(desc(schema.ingestRuns.startedAt)).limit(40);
    return (
      <section className="panel">
        <h2>Automatic imports</h2>
        <p className="muted small">
          Runs nightly. New places arrive as “not yet reviewed” and wait in the review queue. Changes to anything a person entered or locked also go to review.
        </p>
        <table className="t">
          <thead>
            <tr>
              <th>Source</th>
              <th>When</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id}>
                <td>{r.source}</td>
                <td className="small">{new Date(r.startedAt).toLocaleString("en-US", { timeZone: "America/Denver" })}</td>
                <td className="small">
                  {r.status === "ok" ? "✓ " : r.status === "error" ? "⚠️ " : "… "}
                  {Object.entries(r.stats ?? {})
                    .filter(([, v]) => v)
                    .map(([k, v]) => `${v} ${k}`)
                    .join(", ")}
                  {r.error && <div className="muted">{r.error}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    );
  }
}

function FieldRow({ label, old, next, isCreate }: { label: string; old: unknown; next: unknown; isCreate: boolean }) {
  return (
    <>
      <b>{label}</b>
      {isCreate ? (
        <span className="muted">new</span>
      ) : old === null || old === undefined || old === "" || old === "—" ? (
        <span className="muted small">(empty)</span>
      ) : (
        <span className="old">{show(old)}</span>
      )}
      <span className="new">{show(next)}</span>
    </>
  );
}
