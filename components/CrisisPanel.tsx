import { CRISIS_LINES } from "@/lib/crisis-lines";

export function CrisisPanel({ kinds, level }: { kinds: string[]; level: string }) {
  const lines = CRISIS_LINES.filter((l) => !kinds.length || l.kinds.some((k) => kinds.includes(k)));
  return (
    <section className="crisis" role="alert" aria-live="assertive">
      <h2>{level === "urgent" ? "Safety first — help is available right now" : "If things feel unsafe, you don’t have to wait"}</h2>
      <p>
        These options are free and confidential. 988 connects to a trained counselor and does not send police unless there is an
        immediate threat to life.
      </p>
      <div className="lines">
        {lines.map((l) => (
          <a key={l.label} className="line" href={l.href}>
            <b>{l.label}</b>
            <span className="small">{l.detail}</span>
          </a>
        ))}
      </div>
    </section>
  );
}
