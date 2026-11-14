"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { findServices, cardsForCategories, type FindResponse } from "@/app/actions";
import type { ServiceCard } from "@/lib/dto";
import { TIER_LABEL } from "@/lib/fields";
import { ServiceCardView } from "./ServiceCardView";
import { CrisisPanel } from "./CrisisPanel";
import { usePlan } from "./PlanProvider";

export type Chip = { slug: string; label: string; icon: string };
export type RubricDim = { slug: string; name: string; color: string; tiers: { tier: number; cats: { slug: string; name: string }[] }[] };

type SpeechRec = { lang: string; interimResults: boolean; continuous: boolean; start(): void; stop(): void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };

export function Finder({ mode, chips, rubric, aiOn }: { mode: "volunteer" | "participant"; chips: Chip[]; rubric?: RubricDim[]; aiOn: boolean }) {
  const volunteer = mode === "volunteer";
  const plan = usePlan();
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [filters, setFilters] = useState({ openToday: false, petsOk: false, noIdNeeded: false, includeUnverified: false });
  const [res, setRes] = useState<FindResponse | null>(null);
  const [browse, setBrowse] = useState<{ title: string; cards: ServiceCard[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [listening, setListening] = useState(false);
  const [speechOk, setSpeechOk] = useState(false);
  const recRef = useRef<SpeechRec | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
    setSpeechOk(!!(w.SpeechRecognition || w.webkitSpeechRecognition));
  }, []);

  function toggleMic() {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const w = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
    const Rec = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Rec) return;
    const rec = new Rec();
    rec.lang = navigator.language?.startsWith("es") ? "es-US" : "en-US";
    rec.interimResults = false;
    rec.continuous = true;
    const base = text;
    rec.onresult = (e) => {
      const said = Array.from(e.results).map((r) => r[0].transcript).join(" ");
      setText((base ? base + " " : "") + said);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  }

  function run(nextPicked = picked, nextFilters = filters) {
    if (!text.trim() && !nextPicked.length) return;
    setError(null);
    setBrowse(null);
    start(async () => {
      try {
        const r = await findServices({ text, chips: nextPicked, filters: nextFilters, mode });
        setRes(r);
        if (text.trim()) plan.setMeta({ intakeText: text });
        setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
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

  function browseCategory(slug: string, name: string) {
    start(async () => {
      const cards = await cardsForCategories([slug]);
      setRes(null);
      setBrowse({ title: name, cards });
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    });
  }

  function setFilter(k: keyof typeof filters, v: boolean) {
    const next = { ...filters, [k]: v };
    setFilters(next);
    if (res) run(picked, next);
  }

  const total = res ? res.tiers[1].length + res.tiers[2].length + res.tiers[3].length : 0;

  return (
    <div>
      <section className="panel intake">
        <label htmlFor="intake">
          {volunteer ? "What’s going on? Write it the way they said it." : "What’s going on? Tell us in your own words."}
          <span className="hint" style={{ display: "block" }}>
            {volunteer
              ? "Example: “my tent got taken in the sweep, I haven’t eaten since yesterday, and I have a dog”"
              : "Example: “I lost my ID, I’m hungry, and I need somewhere to charge my phone”"}
          </span>
        </label>
        <textarea
          id="intake"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type here, or tap the 🎤 on your keyboard to talk"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) run();
          }}
        />
        <div className="intake-bar">
          <button className="btn btn-primary" onClick={() => run()} disabled={pending || (!text.trim() && !picked.length)}>
            {pending ? "Finding…" : "Find help"}
          </button>
          {speechOk && (
            <button type="button" className={`btn mic${listening ? " on" : ""}`} onClick={toggleMic} aria-pressed={listening} aria-label={listening ? "Stop listening" : "Speak"}>
              🎤
            </button>
          )}
          {(text || picked.length > 0 || res) && (
            <button
              className="btn btn-ghost"
              onClick={() => {
                setText("");
                setPicked([]);
                setRes(null);
                setBrowse(null);
              }}
            >
              Start over
            </button>
          )}
          {aiOn && <span className="small muted">✨ AI assist on</span>}
        </div>

        <div style={{ marginTop: 18 }}>
          <div className="eyebrow">Or tap what’s needed</div>
          <div className="chips">
            {chips.map((c) => (
              <button key={c.slug} type="button" className="chip" aria-pressed={picked.includes(c.slug)} onClick={() => togglePick(c.slug)}>
                <span aria-hidden>{c.icon}</span> {c.label}
              </button>
            ))}
          </div>
        </div>

        <div className="filters">
          <label className="check">
            <input type="checkbox" checked={filters.openToday} onChange={(e) => setFilter("openToday", e.target.checked)} /> Open today
          </label>
          <label className="check">
            <input type="checkbox" checked={filters.petsOk} onChange={(e) => setFilter("petsOk", e.target.checked)} /> Pets OK
          </label>
          <label className="check">
            <input type="checkbox" checked={filters.noIdNeeded} onChange={(e) => setFilter("noIdNeeded", e.target.checked)} /> No ID needed
          </label>
          {volunteer && (
            <label className="check">
              <input type="checkbox" checked={filters.includeUnverified} onChange={(e) => setFilter("includeUnverified", e.target.checked)} /> Include not-yet-reviewed
            </label>
          )}
        </div>
      </section>

      {error && <div className="notice">{error}</div>}

      <div ref={resultsRef} aria-live="polite">
        {res?.crisis && res.crisis.level !== "none" && <CrisisPanel kinds={res.crisis.kinds} level={res.crisis.level} />}

        {res && (
          <section>
            {res.heard.length > 0 && (
              <div className="heard" style={{ margin: "8px 0 4px" }}>
                <span className="eyebrow" style={{ margin: 0 }}>
                  What we heard:
                </span>
                {res.heard.map((h) => (
                  <span className="pill" key={h.slug} title={h.reasons.join(", ")}>
                    {h.name}
                  </span>
                ))}
              </div>
            )}
            {total === 0 && (
              <div className="notice">
                Nothing matched yet. Try different words (“food”, “shower”, “ID”), tap one of the buttons above
                {volunteer ? ", or browse by wellness dimension below." : ", or ask a BFF navigator in Central Park (Tuesdays 2:30 and Fridays 11am)."}
              </div>
            )}
            {([1, 2, 3] as const).map((t) =>
              res.tiers[t].length ? (
                <div className="tier" key={t}>
                  <div className={`tier-head tier-${t}`}>
                    <span className="tier-num">{t}</span>
                    <h2>{TIER_LABEL[t].title}</h2>
                    <span className="muted">{TIER_LABEL[t].blurb}</span>
                  </div>
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
            <div className="tier-head">
              <h2>{browse.title}</h2>
              <span className="muted">{browse.cards.length} services</span>
            </div>
            {browse.cards.map((s) => (
              <ServiceCardView key={s.id} s={s} volunteer={volunteer} />
            ))}
          </section>
        )}
      </div>

      {rubric && (
        <section style={{ marginTop: 32 }}>
          <h2>Browse by wellness dimension</h2>
          <p className="muted small">Libby’s Eight Dimensions rubric. Tier 1 = right now · Tier 2 = next time · Tier 3 = long term.</p>
          <div className="rubric">
            {rubric.map((d) => (
              <div className="dim" key={d.slug}>
                <div className="dim-head" style={{ background: d.color }}>
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
        </section>
      )}
    </div>
  );
}
