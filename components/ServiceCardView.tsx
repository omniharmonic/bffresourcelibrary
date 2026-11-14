"use client";

import Link from "next/link";
import type { ServiceCard } from "@/lib/dto";
import { usePlan } from "./PlanProvider";

export function telHref(phone: string) {
  const digits = phone.replace(/[^\d+]/g, "");
  return `tel:${digits.length === 10 ? "+1" + digits : digits}`;
}
const mapHref = (address: string) => `https://maps.google.com/?q=${encodeURIComponent(address.includes("CO") ? address : address + ", Boulder, CO")}`;
const shortUrl = (u: string) => u.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </>
  );
}

export function ServiceCardView({ s, volunteer, showAdd = true }: { s: ServiceCard; volunteer: boolean; showAdd?: boolean }) {
  const plan = usePlan();
  const inPlan = plan.has(s.id);
  const verified = s.verifiedAt ? new Date(s.verifiedAt) : null;
  const quick = s.details.filter((d) => ["walkIn", "cost", "idRequired"].includes(d.key));
  return (
    <article className={`svc${inPlan ? " in-plan" : ""}`}>
      <div className="svc-top">
        <div className="svc-title">
          <h3>
            {s.preferred && (
              <span className="star" title="BFF preferred" aria-label="BFF preferred">
                ★{" "}
              </span>
            )}
            {volunteer ? <Link href={`/services/${s.id}`}>{s.name}</Link> : s.name}
          </h3>
          <div className="facts">
            <span className={`status ${s.open.state}`}>{s.open.label}</span>
            {s.status === "unverified" && <span className="status unverified">Not yet reviewed</span>}
            {s.status === "temporary" && <span className="status later-today">Pop-up</span>}
            {s.schedule && <span className="fact">🕑 {s.schedule}</span>}
            {s.petPolicy && <span className="fact">🐾 {s.petPolicy.length > 28 ? "Pets: see notes" : s.petPolicy}</span>}
            {quick.map((d) => (
              <span className="fact" key={d.key}>
                {d.key === "walkIn" ? (d.value === "yes" ? "🚶 Walk-ins OK" : "📅 Call first") : d.key === "idRequired" ? (d.value === "yes" ? "🪪 ID needed" : "🪪 No ID needed") : `💲 ${d.value.length > 22 ? d.value.slice(0, 20) + "…" : d.value}`}
              </span>
            ))}
          </div>
        </div>
        {showAdd && (
          <button
            type="button"
            className={`btn btn-sm add-btn ${inPlan ? "btn-dark" : "btn-primary"}`}
            aria-pressed={inPlan}
            onClick={() => plan.toggle({ serviceId: s.id, name: s.name, tier: s.tier })}
          >
            {inPlan ? "✓ In plan" : "+ Add"}
          </button>
        )}
      </div>
      {s.summary && <p className="svc-summary">{s.summary}</p>}
      {(s.phone || s.address) && (
        <div className="svc-actions">
          {s.phone && (
            <a className="btn" href={telHref(s.phone)}>
              📞 {s.phone}
            </a>
          )}
          {s.address && (
            <a className="btn" href={mapHref(s.address)} target="_blank" rel="noreferrer">
              📍 Directions
            </a>
          )}
        </div>
      )}
      {s.reasons && s.reasons.length > 0 && <div className="why">Matched: {s.reasons.join(" · ")}</div>}
      <details className="more">
        <summary>What to expect</summary>
        <dl>
          {s.access && <Row label="How to get there">{s.access}</Row>}
          {s.hoursText && <Row label="Hours">{s.hoursText}</Row>}
          {s.address && (
            <Row label="Where">
              <a href={mapHref(s.address)} target="_blank" rel="noreferrer">
                {s.address}
              </a>
            </Row>
          )}
          {s.fieldNotes && <Row label="Field notes">{s.fieldNotes}</Row>}
          {s.eligibility && <Row label="Who can go">{s.eligibility}</Row>}
          {s.details.map((d) => (
            <Row key={d.key} label={d.label}>
              {d.value === "yes" ? "Yes" : d.value === "no" ? "No" : d.value}
            </Row>
          ))}
          {s.petPolicy && <Row label="Pets">{s.petPolicy}</Row>}
          {s.rules && (
            <Row label="Rules">
              {s.rules}
              {s.rulesUrl && (
                <>
                  {" "}
                  <a href={s.rulesUrl} target="_blank" rel="noreferrer">
                    (full rules)
                  </a>
                </>
              )}
            </Row>
          )}
          {s.police && <Row label="Police">{s.police}</Row>}
          {s.url && (
            <Row label="Website">
              <a href={s.url} target="_blank" rel="noreferrer">
                {shortUrl(s.url)}
              </a>
            </Row>
          )}
          {volunteer && s.internalNotes && <Row label="Internal">{s.internalNotes}</Row>}
          <Row label="Checked">
            <span className="muted">
              {verified ? `Verified ${verified.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : "Not yet verified by a person"}
              {s.verificationNote ? ` · ${s.verificationNote}` : ""}
            </span>
          </Row>
        </dl>
      </details>
    </article>
  );
}
