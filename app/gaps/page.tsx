import { asc } from "drizzle-orm";
import { requireRole } from "@/lib/session";
import { getDb, schema } from "@/lib/db";
import { saveGapAction } from "@/app/wiki-actions";

export const metadata = { title: "Gaps & follow-ups" };
const STATUSES = ["Not started", "In progress", "Done", "Parked"];

function GapForm({ g, kind }: { g?: typeof schema.gaps.$inferSelect; kind: string }) {
  return (
    <form action={saveGapAction} className="stack" style={{ marginTop: 8 }}>
      {g && <input type="hidden" name="id" value={g.id} />}
      <input type="hidden" name="kind" value={g?.kind ?? kind} />
      <input type="text" name="title" defaultValue={g?.title} placeholder="Title" required aria-label="Title" />
      <textarea name="ideas" defaultValue={g?.ideas ?? ""} placeholder="Ideas or proposed solutions" aria-label="Ideas" style={{ minHeight: 70 }} />
      <div className="grid2">
        <input type="text" name="owner" defaultValue={g?.owner ?? ""} placeholder="Who’s working on it" aria-label="Owner" />
        <select name="status" defaultValue={g?.status ?? "Not started"} aria-label="Status">
          {STATUSES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>
      <div className="btn-row">
        <button className="btn btn-sm btn-primary">{g ? "Save" : "Add"}</button>
        {g && (
          <label className="check small">
            <input type="checkbox" name="delete" /> Delete
          </label>
        )}
      </div>
    </form>
  );
}

export default async function Gaps() {
  await requireRole("volunteer", "/gaps");
  const gaps = await getDb().select().from(schema.gaps).orderBy(asc(schema.gaps.id));
  return (
    <>
      <h1 style={{ fontSize: "clamp(28px,6vw,42px)" }}>Gaps & follow-ups</h1>
      <p className="muted">Shared working list. Never enter participant names or private details here.</p>
      {[
        ["gap", "Known service gaps"],
        ["followup", "Follow-up actions"],
      ].map(([kind, title]) => (
        <section className="panel" key={kind}>
          <h2>{title}</h2>
          <ul className="list">
            {gaps
              .filter((g) => g.kind === kind)
              .map((g) => (
                <li key={g.id}>
                  <details>
                    <summary style={{ cursor: "pointer" }}>
                      <b>{g.title}</b> <span className="pill">{g.status}</span> {g.owner && <span className="small muted">· {g.owner}</span>}
                      {g.ideas && <div className="small muted">{g.ideas}</div>}
                    </summary>
                    <GapForm g={g} kind={kind} />
                  </details>
                </li>
              ))}
          </ul>
          <details style={{ marginTop: 10 }}>
            <summary className="btn btn-sm">+ Add</summary>
            <GapForm kind={kind} />
          </details>
        </section>
      ))}
    </>
  );
}
