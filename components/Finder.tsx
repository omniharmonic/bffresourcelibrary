"use client";

import { useRef, useState, useTransition } from "react";
import { findServices, cardsForCategories, type FindResponse } from "@/app/actions";
import type { ServiceCard } from "@/lib/dto";
import { TIER_LABEL } from "@/lib/fields";
import { ServiceCardView } from "./ServiceCardView";
import { CrisisPanel } from "./CrisisPanel";
import { VoiceInput } from "./VoiceInput";
import { TierHead } from "./TierHead";
import { usePlan } from "./PlanProvider";

export type Chip = { slug: string; label: string; icon: string };
export type RubricDim = { slug: string; name: string; color: string; tiers: { tier: number; cats: { slug: string; name: string }[] }[] };

const FILTERS = [
  { key: "openToday", label: "Open today" },
  { key: "petsOk", label: "Pets OK" },
  { key: "noIdNeeded", label: "No ID needed" },
] as const;

export function Finder({ mode, chips, rubric, aiOn }: { mode: "volunteer" | "participant"; chips: Chip[]; rubric?: RubricDim[]; aiOn: boolean }) {
  const volunteer = mode === "volunteer";
  const plan = usePlan();
  const [text, setText] = useState("");
  const textRef = useRef("");
  textRef.current = text;
  const [picked, setPicked] = useState<string[]>([]);
  const [filters, setFilters] = useState({ openToday: false, petsOk: false, noIdNeeded: false, includeUnverified: false });
  const [res, setRes] = useState<FindResponse | null>(null);
  const [browse, setBrowse] = useState<{ title: string; cards: ServiceCard[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const resultsRef = useRef<HTMLDivElement>(null);
  const [showRubric, setShowRubric] = useState(false);

  const scrollToResults = () => setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);

  function run(nextPicked = picked, nextFilters = filters) {
    if (!text.trim() && !nextPicked.length) return;
    setError(null);
    setBrowse(null);
    start(async () => {
      try {
        const r = await findServices({ text, chips: nextPicked, filters: nextFilters, mode });
        setRes(r);
        if (text.trim()) plan.setMeta({ intakeText: text });
        scrollToResults();
      } catch (e) {
        setError((e as Error).message || "Something went wrong. Try again.");
      }
    });
  }

  function togglePick(slug: string) {
    const next = picked.includes(slug) ? picked.filter((p) => p !== slug) : [...picked, slug];
    setPicked(next);
    if (res) run(next);
  }

  function setFilter(k: keyof typeof filters, v: boolean) {
    const next = { ...filters, [k]: v };
    setFilters(next);
    if (res) run(picked, next);
  }

  function browseCategory(slug: string, name: string) {
    start(async () => {
      const cards = await cardsForCategories([slug]);
      setRes(null);
      setBrowse({ title: name, cards });
      scrollToResults();
    });
  }

  function reset() {
    setText("");
    setPicked([]);
    setRes(null);
    setBrowse(null);
    setError(null);
  }

  const total = res ? res.tiers[1].length + res.tiers[2].length + res.tiers[3].length : 0;

  return (
    <div>
      <section className="intake" aria-labelledby="intake-label">
        <label id="intake-label" htmlFor="intake" className="intake-title">
          What’s going on?
        </label>
        <div className="intake-example">
          {volunteer
            ? "Write it the way they said it — e.g. “my tent got taken in the sweep, I haven’t eaten since yesterday, and I have a dog.”"
            : "Say it in your own words — e.g. “I lost my ID, I’m hungry, and my phone is dead.”"}
        </div>
        <div className="intake-field">
          <textarea
            id="intake"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type here, or tap the mic to talk"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) run();
            }}
          />
          <VoiceInput onText={setText} getBase={() => textRef.current} />
        </div>
        <div className="intake-actions">
          <button className="btn btn-primary" onClick={() => run()} disabled={pending || (!text.trim() && !picked.length)}>
            {pending ? "Finding…" : "Find help"}
          </button>
          {(text || picked.length > 0 || res || browse) && (
            <button className="btn btn-ghost" onClick={reset}>
              Clear search
            </button>
          )}
          {aiOn && (
            <span className="ai-on" title="AI assist helps match free text to categories">
              ✨ AI assist on
            </span>
          )}
        </div>

        <div className="section-label">
          <span className="eyebrow">Or tap what’s needed</span>
          {picked.length > 0 && <span className="small muted">{picked.length} selected</span>}
        </div>
        <div className="needs">
          {chips.map((c) => (
            <button key={c.slug} type="button" className="need" aria-pressed={picked.includes(c.slug)} onClick={() => togglePick(c.slug)}>
              <span className="ico" aria-hidden>
                {c.icon}
              </span>
              {c.label}
            </button>
          ))}
        </div>

        <div className="toggles" role="group" aria-label="Filters">
          {FILTERS.map((f) => (
            <button key={f.key} type="button" className="toggle" aria-pressed={filters[f.key]} onClick={() => setFilter(f.key, !filters[f.key])}>
              {f.label}
            </button>
          ))}
          {volunteer && (
            <button
              type="button"
              className="toggle"
              aria-pressed={filters.includeUnverified}
              onClick={() => setFilter("includeUnverified", !filters.includeUnverified)}
            >
              Include not-yet-reviewed
            </button>
          )}
        </div>
      </section>

      {error && <div className="alert">{error}</div>}

      <div ref={resultsRef} aria-live="polite" style={{ scrollMarginTop: 12 }}>
        {res?.crisis && res.crisis.level !== "none" && <CrisisPanel kinds={res.crisis.kinds} level={res.crisis.level} />}

        {res && (
          <section>
            {res.heard.length > 0 && (
              <div className="heard">
                <span className="eyebrow">What we heard</span>
                {res.heard.map((h) => (
                  <span className="pill" key={h.slug} title={h.reasons.join(", ")}>
                    {h.name}
                  </span>
                ))}
              </div>
            )}
            {total > 0 && (
              <p className="results-meta">
                {total} {total === 1 ? "place" : "places"} · tap <b>+ Add</b> to build a plan
              </p>
            )}
            {total === 0 && (
              <div className="notice">
                Nothing matched yet. Try different words (“food”, “shower”, “ID”) or tap one of the buttons above
                {volunteer ? ", or browse by wellness dimension below." : ". You can also find BFF navigators in Central Park, Tuesdays 2:30pm and Fridays 11am."}
              </div>
            )}
            {([1, 2, 3] as const).map((t) =>
              res.tiers[t].length ? (
                <div className={`tier tier-${t}`} key={t}>
                  <TierHead tier={t} />
                  {res.tiers[t].map((s) => (
                    <ServiceCardView key={s.id} s={s} volunteer={volunteer} />
                  ))}
                </div>
              ) : null,
            )}
            {res.usedFallback && <p className="small muted">Some results came from a keyword search.</p>}
          </section>
        )}

        {browse && (
          <section className="tier">
            <div className="tier-head" style={{ background: "var(--surface)" }}>
              <div style={{ flex: 1 }}>
                <h2>{browse.title}</h2>
                <div className="tier-blurb">{browse.cards.length} services</div>
              </div>
              <button className="btn btn-sm" onClick={() => setBrowse(null)}>
                Close
              </button>
            </div>
            {browse.cards.map((s) => (
              <ServiceCardView key={s.id} s={s} volunteer={volunteer} />
            ))}
          </section>
        )}
      </div>

      {rubric && (
        <section style={{ marginTop: 36 }}>
          <div className="section-head">
            <div>
              <h2 style={{ marginBottom: 2 }}>Browse by wellness dimension</h2>
              <p className="muted small" style={{ margin: 0 }}>
                Libby’s Eight Dimensions rubric · {Object.values(TIER_LABEL).map((t) => t.title).join(" → ")}
              </p>
            </div>
            <button type="button" className="btn btn-sm" aria-expanded={showRubric} onClick={() => setShowRubric((v) => !v)}>
              {showRubric ? "Hide dimensions" : "Show all dimensions"}
            </button>
          </div>
          {showRubric && (
            <div className="rubric">
              {rubric.map((d) => (
                <div className="dim" key={d.slug}>
                  <div className="dim-head">
                    <span className="dim-dot" style={{ background: d.color }} aria-hidden />
                    {d.name}
                  </div>
                  <div className="dim-body">
                    {d.tiers.map((t) =>
                      t.cats.length ? (
                        <div key={t.tier}>
                          <div className="dim-tier">{TIER_LABEL[t.tier].title}</div>
                          {t.cats.map((c) => (
                            <button key={c.slug} className="chip" type="button" onClick={() => browseCategory(c.slug, c.name)}>
                              {c.name}
                            </button>
                          ))}
                        </div>
                      ) : null,
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
