"use client";

import Link from "next/link";
import type { ServiceCard } from "@/lib/dto";
import { usePlan } from "./PlanProvider";

function telHref(phone: string) {
  const digits = phone.replace(/[^\d+]/g, "");
  return `tel:${digits.length === 10 ? "+1" + digits : digits}`;
}

export function ServiceCardView({ s, volunteer, showAdd = true }: { s: ServiceCard; volunteer: boolean; showAdd?: boolean }) {
  const plan = usePlan();
  const inPlan = plan.has(s.id);
  const verified = s.verifiedAt ? new Date(s.verifiedAt) : null;
  const hasMore = s.access || s.fieldNotes || s.rules || s.eligibility || s.police || s.internalNotes || s.address || s.hoursText;
  return (
    <article className={`svc${inPlan ? " in-plan" : ""}`}>
      <div className="svc-top">
        <h3>
          {s.preferred && (
            <span className="star" title="BFF preferred" aria-label="BFF preferred">
              ★{" "}
            </span>
          )}
          {volunteer ? <Link href={`/services/${s.id}`}>{s.name}</Link> : s.name}
        </h3>
        {showAdd && (
          <button
            type="button"
            className={`btn btn-sm ${inPlan ? "btn-dark" : "btn-primary"}`}
            aria-pressed={inPlan}
            onClick={() => plan.toggle({ serviceId: s.id, name: s.name, tier: s.tier })}
          >
            {inPlan ? "✓ In plan" : "+ Add"}
          </button>
        )}
      </div>
      <div className="facts">
        <span className={`status ${s.open.state}`}>{s.open.label}</span>
        {s.status === "unverified" && <span className="status unverified">Not yet reviewed</span>}
        {s.status === "temporary" && <span className="status later-today">Pop-up</span>}
        {s.schedule && <span>🕑 {s.schedule}</span>}
        {s.phone && (
          <span>
            📞 <a href={telHref(s.phone)}>{s.phone}</a>
          </span>
        )}
        {s.petPolicy && <span>🐾 {s.petPolicy}</span>}
      </div>
      {s.summary && <p style={{ margin: "4px 0" }}>{s.summary}</p>}
      {s.reasons && s.reasons.length > 0 && <div className="why">Matched: {s.reasons.join(", ")}</div>}
      {hasMore && (
        <details className="more">
          <summary>What to expect</summary>
          <dl>
            {s.access && (
              <>
                <dt>How to get there</dt>
                <dd>{s.access}</dd>
              </>
            )}
            {s.hoursText && (
              <>
                <dt>Hours</dt>
                <dd>{s.hoursText}</dd>
              </>
            )}
            {s.address && (
              <>
                <dt>Where</dt>
                <dd>
                  <a href={`https://maps.google.com/?q=${encodeURIComponent(s.address)}`} target="_blank" rel="noreferrer">
                    {s.address}
                  </a>
                </dd>
              </>
            )}
            {s.fieldNotes && (
              <>
                <dt>Field notes</dt>
                <dd>{s.fieldNotes}</dd>
              </>
            )}
            {s.eligibility && (
              <>
                <dt>Who can go</dt>
                <dd>{s.eligibility}</dd>
              </>
            )}
            {s.rules && (
              <>
                <dt>Rules</dt>
                <dd>
                  {s.rules}
                  {s.rulesUrl && (
                    <>
                      {" "}
                      <a href={s.rulesUrl} target="_blank" rel="noreferrer">
                        (full rules)
                      </a>
                    </>
                  )}
                </dd>
              </>
            )}
            {s.police && (
              <>
                <dt>Police</dt>
                <dd>{s.police}</dd>
              </>
            )}
            {s.url && (
              <>
                <dt>Website</dt>
                <dd>
                  <a href={s.url} target="_blank" rel="noreferrer">
                    {s.url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
                  </a>
                </dd>
              </>
            )}
            {volunteer && s.internalNotes && (
              <>
                <dt>Internal</dt>
                <dd>{s.internalNotes}</dd>
              </>
            )}
            <dt>Checked</dt>
            <dd className="muted">
              {verified ? `Verified ${verified.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : "Not yet verified by a person"}
              {s.verificationNote ? ` · ${s.verificationNote}` : ""}
            </dd>
          </dl>
        </details>
      )}
    </article>
  );
}
