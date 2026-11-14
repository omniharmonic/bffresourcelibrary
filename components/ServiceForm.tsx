import { SERVICE_FIELDS } from "@/lib/fields";
import type { Service, Catalog } from "@/lib/catalog";
import { proposeService } from "@/app/wiki-actions";

export function ServiceForm({ s, c, admin }: { s?: Service; c: Catalog; admin: boolean }) {
  const val = (k: string) => ((s as Record<string, unknown> | undefined)?.[k] as string | null) ?? "";
  const date = (d?: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : "");
  return (
    <form action={proposeService} className="panel">
      {s && <input type="hidden" name="serviceId" value={s.id} />}
      {!admin && (
        <div className="notice">Your changes go to Libby / a BFF admin for approval before they show up for everyone.</div>
      )}
      {SERVICE_FIELDS.map((f) => (
        <div className="field" key={f.key}>
          <label htmlFor={f.key}>{f.label}</label>
          {f.long ? (
            <textarea id={f.key} name={f.key} defaultValue={val(f.key)} style={{ minHeight: 90 }} />
          ) : (
            <input id={f.key} name={f.key} type="text" defaultValue={val(f.key)} required={f.key === "name"} />
          )}
        </div>
      ))}
      <fieldset className="field" style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 12 }}>
        <legend style={{ fontWeight: 700 }}>Categories</legend>
        {c.dimensions.map((d) => (
          <div key={d.slug} style={{ marginBottom: 8 }}>
            <div className="dim-tier" style={{ color: d.color }}>
              {d.name}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0 16px" }}>
              {c.categories
                .filter((x) => x.dimensionSlug === d.slug)
                .map((x) => (
                  <label className="check" key={x.slug} style={{ minHeight: 36 }}>
                    <input type="checkbox" name="categories" value={x.slug} defaultChecked={s?.categories.includes(x.slug)} /> {x.name}
                  </label>
                ))}
            </div>
          </div>
        ))}
      </fieldset>
      <div className="grid2">
        <div className="field">
          <label htmlFor="status">Status</label>
          <select id="status" name="status" defaultValue={s?.status ?? "active"}>
            <option value="active">Active</option>
            <option value="temporary">Pop-up / temporary</option>
            <option value="unverified">Not yet reviewed</option>
            <option value="inactive">Closed / inactive</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="startsAt">Pop-up starts</label>
          <input id="startsAt" name="startsAt" type="date" defaultValue={date(s?.startsAt)} />
        </div>
        <div className="field">
          <label htmlFor="endsAt">Pop-up ends (hidden after this date)</label>
          <input id="endsAt" name="endsAt" type="date" defaultValue={date(s?.endsAt)} />
        </div>
      </div>
      <input type="hidden" name="preferredField" value="1" />
      <label className="check">
        <input type="checkbox" name="preferred" defaultChecked={s?.preferred} /> ★ BFF preferred
      </label>
      <div className="field" style={{ marginTop: 12 }}>
        <label htmlFor="why">
          What changed and how do you know? <span className="hint">(helps the reviewer)</span>
        </label>
        <input id="why" name="why" type="text" placeholder="e.g. Called them 11/14, hours changed for winter" />
      </div>
      <button className="btn btn-primary">{admin ? "Save" : "Send for review"}</button>
    </form>
  );
}
