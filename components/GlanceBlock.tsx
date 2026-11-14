import type { Glance } from "@/lib/glance";

function tel(phone: string) {
  const d = phone.replace(/[^\d+]/g, "");
  return `tel:${d.length === 10 ? "+1" + d : d}`;
}

/** When / Where / Call — always first on a card or printed plan item. */
export function GlanceBlock({ g, print = false }: { g: Glance; print?: boolean }) {
  return (
    <dl className={`glance${print ? " glance-print" : ""}`}>
      <div className="glance-row">
        <dt>When</dt>
        <dd>
          {!print && g.when.state !== "unknown" && <span className={`status ${g.when.state}`}>{g.when.label}</span>}
          {g.when.hours ? <span className="glance-val">{g.when.hours}</span> : <span className="glance-val muted">Call for hours</span>}
        </dd>
      </div>
      <div className="glance-row">
        <dt>Where</dt>
        <dd>
          {g.where ? (
            g.where.mapUrl && !print ? (
              <a className="glance-val" href={g.where.mapUrl} target="_blank" rel="noreferrer">
                {g.where.text}
              </a>
            ) : (
              <span className="glance-val">{g.where.text}</span>
            )
          ) : (
            <span className="glance-val muted">Ask / see notes</span>
          )}
        </dd>
      </div>
      {g.phone && (
        <div className="glance-row">
          <dt>Call</dt>
          <dd>
            {print ? (
              <span className="glance-val glance-phone">{g.phone}</span>
            ) : (
              <a className="glance-val glance-phone" href={tel(g.phone)}>
                {g.phone}
              </a>
            )}
          </dd>
        </div>
      )}
      {g.facts.length > 0 && (
        <div className="glance-facts">
          {g.facts.map((f) => (
            <span key={f} className="fact">
              ✓ {f}
            </span>
          ))}
        </div>
      )}
    </dl>
  );
}
