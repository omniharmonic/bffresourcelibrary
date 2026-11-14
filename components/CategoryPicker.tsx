"use client";

import { useMemo, useState } from "react";

type Cat = { slug: string; name: string; dimension: string; color: string; icon?: string | null };

/** Search-and-tap category chooser (replaces a wall of 70+ checkboxes). Submits hidden `categories` inputs. */
export function CategoryPicker({ all, initial = [], name = "categories" }: { all: Cat[]; initial?: string[]; name?: string }) {
  const [picked, setPicked] = useState<string[]>(initial);
  const [q, setQ] = useState("");
  const bySlug = useMemo(() => new Map(all.map((c) => [c.slug, c])), [all]);
  const results = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return [];
    return all.filter((c) => !picked.includes(c.slug) && (c.name.toLowerCase().includes(n) || c.dimension.toLowerCase().includes(n))).slice(0, 12);
  }, [q, all, picked]);

  const add = (slug: string) => {
    setPicked((p) => (p.includes(slug) ? p : [...p, slug]));
    setQ("");
  };
  const remove = (slug: string) => setPicked((p) => p.filter((x) => x !== slug));

  return (
    <div className="catpick">
      {picked.map((slug) => (
        <input key={slug} type="hidden" name={name} value={slug} />
      ))}
      <div className="chips" aria-live="polite">
        {picked.length === 0 && <span className="muted small">None chosen yet.</span>}
        {picked.map((slug) => {
          const c = bySlug.get(slug);
          return (
            <button key={slug} type="button" className="chip" aria-pressed="true" onClick={() => remove(slug)} aria-label={`Remove ${c?.name ?? slug}`}>
              {c?.icon ? `${c.icon} ` : ""}
              {c?.name ?? slug} <span aria-hidden>✕</span>
            </button>
          );
        })}
      </div>
      <label htmlFor="cat-search" className="sr-only">
        Search categories
      </label>
      <input
        id="cat-search"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (results[0]) add(results[0].slug);
          }
        }}
        placeholder="Type to find a category — e.g. food, shower, ID, housing"
        style={{ marginTop: 10 }}
      />
      {results.length > 0 && (
        <div className="catpick-results" role="listbox" aria-label="Matching categories">
          {results.map((c) => (
            <button key={c.slug} type="button" role="option" aria-selected="false" className="catpick-opt" onClick={() => add(c.slug)}>
              <span className="dim-dot" style={{ background: c.color }} aria-hidden />
              <span>
                {c.icon ? `${c.icon} ` : ""}
                {c.name}
              </span>
              <span className="muted small">{c.dimension}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
