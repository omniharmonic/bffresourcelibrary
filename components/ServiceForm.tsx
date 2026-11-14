import Link from "next/link";
import { SERVICE_FIELDS } from "@/lib/fields";
import { DETAIL_FIELDS, formatDetail } from "@/lib/details";
import type { Service, Catalog } from "@/lib/catalog";
import { proposeService } from "@/app/wiki-actions";
import { CategoryPicker } from "./CategoryPicker";
import { HowDoYouKnow } from "./HowDoYouKnow";

export type EditTask = "all" | "hours" | "place" | "contact" | "note" | "details" | "closed";

export const TASKS: { task: EditTask; icon: string; label: string; blurb: string }[] = [
  { task: "hours", icon: "🕑", label: "Hours changed", blurb: "New days or times" },
  { task: "place", icon: "📍", label: "Moved / new place", blurb: "Address or meeting spot" },
  { task: "contact", icon: "📞", label: "Phone or website changed", blurb: "Numbers, links, email" },
  { task: "note", icon: "📝", label: "Add a field note", blurb: "What it’s really like" },
  { task: "details", icon: "✨", label: "Add “before you go” info", blurb: "Walk-ins, cost, ID…" },
  { task: "closed", icon: "🚫", label: "It’s closed", blurb: "Not running any more" },
];

const F = Object.fromEntries(SERVICE_FIELDS.map((f) => [f.key, f])) as Record<string, (typeof SERVICE_FIELDS)[number]>;
const EXAMPLES: Record<string, string> = {
  hoursText: "e.g. Mon–Fri 9am–3pm · Tuesdays 2:30–3:30 PM · 24/7",
  address: "e.g. 4869 N Broadway, Boulder",
  access: "e.g. Southeast corner of Central Park. Check in at the front desk.",
  phone: "e.g. 303-555-0100",
  url: "e.g. https://example.org",
  summary: "e.g. Hot lunch, no ID or sign-up needed.",
};

function Field({ k, s, long }: { k: string; s?: Service; long?: boolean }) {
  const f = F[k];
  const v = ((s as Record<string, unknown> | undefined)?.[k] as string | null) ?? "";
  const isLong = long ?? f.long;
  return (
    <div className="field">
      <label htmlFor={k}>{f.label}</label>
      {isLong ? (
        <textarea id={k} name={k} defaultValue={v} placeholder={EXAMPLES[k]} style={{ minHeight: 90 }} />
      ) : (
        <input id={k} name={k} type={k === "url" ? "url" : k === "phone" ? "tel" : "text"} defaultValue={v} placeholder={EXAMPLES[k]} required={k === "name"} />
      )}
    </div>
  );
}

function Section({ n, title, hint, children }: { n?: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="form-section">
      <h3>
        {n ? <span className="step-num">{n}</span> : null}
        {title}
      </h3>
      {hint && <p className="hint">{hint}</p>}
      {children}
    </section>
  );
}

function Details({ s }: { s?: Service }) {
  return (
    <div className="grid2">
      {DETAIL_FIELDS.map((f) => {
        const cur = (s?.details as Record<string, unknown> | null | undefined)?.[f.key];
        const id = `detail-${f.key}`;
        return (
          <div className="field" key={f.key}>
            <label htmlFor={id}>
              {f.label}
              <span className="hint" style={{ display: "block" }}>
                {f.help}
              </span>
            </label>
            {f.kind === "boolean" ? (
              <select id={id} name={`detail.${f.key}`} defaultValue={cur === true ? "yes" : cur === false ? "no" : ""}>
                <option value="">Not sure</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            ) : (
              <input id={id} name={`detail.${f.key}`} type="text" defaultValue={formatDetail(f.key, cur)} placeholder={f.kind === "list" ? "Separate with commas" : ""} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function Current({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="current">
      <span className="eyebrow">Right now it says</span>
      <div>
        <b>{label}:</b> {value?.trim() ? value : <span className="muted">(nothing yet)</span>}
      </div>
    </div>
  );
}

export function ServiceForm({ s, c, admin, task = "all" }: { s?: Service; c: Catalog; admin: boolean; task?: EditTask }) {
  const cats = c.categories.map((x) => ({
    slug: x.slug,
    name: x.name,
    icon: x.icon,
    dimension: c.dimensions.find((d) => d.slug === x.dimensionSlug)?.name ?? "",
    color: c.dimensions.find((d) => d.slug === x.dimensionSlug)?.color ?? "#999",
  }));
  const submitLabel = admin ? "Save" : "Send for review";
  const isNew = !s;

  return (
    <form action={proposeService} className="panel edit-form">
      {s && <input type="hidden" name="serviceId" value={s.id} />}
      <input type="hidden" name="task" value={task} />
      {!admin && (
        <p className="review-note">
          <span aria-hidden>🛡️</span> Libby or a BFF admin checks every change before it shows up for everyone. You can’t break anything.
        </p>
      )}

      {task === "hours" && s && (
        <>
          <Current label="Hours" value={s.hoursText || s.access} />
          <Field k="hoursText" s={s} />
          <p className="hint" style={{ marginTop: -8 }}>Write it the way you’d say it. We turn it into a schedule automatically.</p>
          <Field k="access" s={s} />
        </>
      )}

      {task === "place" && s && (
        <>
          <Current label="Where" value={s.address || s.access} />
          <Field k="address" s={s} />
          <Field k="access" s={s} />
        </>
      )}

      {task === "contact" && s && (
        <>
          <Current label="Phone" value={s.phone} />
          <Field k="phone" s={s} />
          <Field k="url" s={s} />
          <Field k="email" s={s} />
        </>
      )}

      {task === "note" && s && (
        <>
          <Current label="Field notes" value={s.fieldNotes} />
          <div className="field">
            <label htmlFor="addNote">What should people know?</label>
            <textarea
              id="addNote"
              name="addNote"
              required
              style={{ minHeight: 120 }}
              placeholder="e.g. Line starts forming around 2pm. Dogs OK on a leash. They ran out of tents last week."
            />
            <p className="hint">Your note is added (with today’s date and your first name) — it doesn’t replace what’s there.</p>
          </div>
        </>
      )}

      {task === "details" && s && <Details s={s} />}

      {task === "closed" && s && (
        <fieldset className="field" style={{ border: 0, padding: 0 }}>
          <legend style={{ fontWeight: 700, color: "var(--ink)", marginBottom: 8 }}>What happened?</legend>
          <label className="check">
            <input type="radio" name="closedKind" value="closed" required /> Closed for good / not running any more
          </label>
          <label className="check">
            <input type="radio" name="closedKind" value="paused" /> Paused for now (seasonal, temporary)
          </label>
        </fieldset>
      )}

      {task === "all" && (
        <>
          <Section n={1} title="What is it?">
            <Field k="name" s={s} />
            <Field k="summary" s={s} />
            {!isNew && <Field k="organization" s={s} />}
          </Section>
          <Section n={2} title="What kind of help?" hint="Pick everything this place helps with. People search by these.">
            <CategoryPicker all={cats} initial={s?.categories ?? []} />
          </Section>
          <Section n={3} title="When and where">
            <Field k="hoursText" s={s} />
            <Field k="address" s={s} />
            <Field k="access" s={s} />
          </Section>
          <Section n={4} title="How to reach them">
            <Field k="phone" s={s} />
            <Field k="url" s={s} />
            {!isNew && <Field k="email" s={s} />}
          </Section>
          <Section n={5} title="What to expect" hint="The things that make or break a referral. Only what you know for sure.">
            <Field k="fieldNotes" s={s} />
            <Field k="petPolicy" s={s} />
            <Field k="police" s={s} />
            <Field k="rules" s={s} />
            <Field k="eligibility" s={s} />
          </Section>
          <details className="form-more">
            <summary>More: before-you-go details, internal notes, status, pop-up dates</summary>
            <h3 style={{ marginTop: 14 }}>Before you go</h3>
            <Details s={s} />
            <Field k="rulesUrl" s={s} />
            <Field k="internalNotes" s={s} />
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
                <input id="startsAt" name="startsAt" type="date" defaultValue={s?.startsAt ? new Date(s.startsAt).toISOString().slice(0, 10) : ""} />
              </div>
              <div className="field">
                <label htmlFor="endsAt">Pop-up ends (hidden after)</label>
                <input id="endsAt" name="endsAt" type="date" defaultValue={s?.endsAt ? new Date(s.endsAt).toISOString().slice(0, 10) : ""} />
              </div>
            </div>
            <input type="hidden" name="preferredField" value="1" />
            <label className="check">
              <input type="checkbox" name="preferred" defaultChecked={s?.preferred} /> ★ BFF preferred
            </label>
          </details>
        </>
      )}

      <HowDoYouKnow />

      <div className="btn-row" style={{ marginTop: 8 }}>
        <button className="btn btn-primary">{submitLabel}</button>
        <Link className="btn btn-ghost" href={s ? `/services/${s.id}` : "/services"}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
