import { DETAIL_BY_KEY, formatDetail } from "@/lib/details";
import { FIELD_LABEL } from "@/lib/fields";

export type EvidenceItem = { url: string; quote: string; method: string; confidence: number; previous?: unknown; conflictsWithFieldNotes?: boolean };
export type EnrichPage = { url: string; hash?: string; checkedAt?: string; datedAt?: string | null; stale?: boolean };

const METHOD: Record<string, string> = { jsonld: "structured data", pattern: "page text", llm: "AI-read, quote checked" };

export function labelFor(key: string) {
  const k = key.replace(/^details\./, "");
  return DETAIL_BY_KEY[k]?.label ?? FIELD_LABEL[k] ?? k;
}

function confidenceWord(c: number) {
  return c >= 0.85 ? "high" : c >= 0.6 ? "medium" : "low";
}

/** Shows exactly where an automated suggestion came from, so a reviewer can trust or reject it in seconds. */
export function Evidence({ evidence, page, conflicts }: { evidence: Record<string, EvidenceItem>; page?: EnrichPage; conflicts?: unknown[] }) {
  const entries = Object.entries(evidence ?? {});
  if (!entries.length && !page) return null;
  return (
    <div style={{ marginTop: 10 }}>
      {page && (
        <div className="small" style={{ marginBottom: 6 }}>
          Source:{" "}
          <a href={page.url} target="_blank" rel="noreferrer">
            {page.url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 70)}
          </a>
          {page.checkedAt && <span className="muted"> · read {new Date(page.checkedAt).toLocaleDateString()}</span>}
          {page.stale && (
            <span className="status later-today" style={{ marginLeft: 8 }}>
              page may be out of date{page.datedAt ? ` (dated ${page.datedAt})` : ""}
            </span>
          )}
        </div>
      )}
      {(conflicts?.length ?? 0) > 0 && (
        <div className="notice small">⚠️ Some suggestions disagree with what a volunteer entered. Check the field notes before approving.</div>
      )}
      {entries.map(([key, e]) => (
        <div className="evidence" key={key}>
          <b style={{ color: "var(--ink)" }}>{labelFor(key)}</b>{" "}
          <span className="pill" style={{ padding: "3px 8px", fontSize: 12 }}>
            {confidenceWord(e.confidence)} confidence · {METHOD[e.method] ?? e.method}
          </span>
          {e.conflictsWithFieldNotes && (
            <span className="status unverified" style={{ marginLeft: 6 }}>
              conflicts with field notes
            </span>
          )}
          <div>
            <q>{e.quote}</q>{" "}
            {e.url && e.url !== page?.url && (
              <a href={e.url} target="_blank" rel="noreferrer" className="small">
                source
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export function detailDisplay(key: string, v: unknown) {
  return formatDetail(key, v) || "—";
}
