"use client";

import { useState } from "react";

const SOURCES = ["I called them", "I visited", "Their website", "A participant told me", "Another volunteer told me"];

/** One-tap source of truth for an edit, plus optional detail. Submits as `why`. */
export function HowDoYouKnow({ required = false }: { required?: boolean }) {
  const [src, setSrc] = useState<string | null>(null);
  const [detail, setDetail] = useState("");
  const why = [src, detail.trim()].filter(Boolean).join(" — ");
  return (
    <fieldset className="field" style={{ border: 0, padding: 0, margin: "18px 0 8px" }}>
      <legend style={{ fontWeight: 700, color: "var(--ink)", marginBottom: 8 }}>How do you know?{required ? "" : " (helps Libby review)"}</legend>
      <div className="chips">
        {SOURCES.map((s) => (
          <button key={s} type="button" className="chip" aria-pressed={src === s} onClick={() => setSrc(src === s ? null : s)}>
            {s}
          </button>
        ))}
      </div>
      <input
        id="why"
        type="text"
        value={detail}
        onChange={(e) => setDetail(e.target.value)}
        placeholder="Anything else? e.g. “Talked to Maria at the front desk on 11/14”"
        style={{ marginTop: 10 }}
        aria-label="More about how you know"
      />
      <input type="hidden" name="why" value={why} />
    </fieldset>
  );
}
