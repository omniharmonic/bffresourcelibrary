"use client";

import { useState, useTransition } from "react";
import type { TreeNode } from "@/lib/db/schema";
import type { ServiceCard } from "@/lib/dto";
import { cardsForCategories } from "@/app/actions";
import { ServiceCardView } from "./ServiceCardView";

export function TreeWalker({ nodes, linkMap }: { nodes: Record<string, TreeNode>; linkMap: Record<string, string> }) {
  const [path, setPath] = useState<string[]>(["start"]);
  const [cards, setCards] = useState<ServiceCard[] | null>(null);
  const [pending, start] = useTransition();
  const id = path[path.length - 1];
  const n = nodes[id] ?? nodes.start;

  function go(next: string) {
    setCards(null);
    setPath((p) => [...p, next]);
  }
  function showServices(links: string[]) {
    const slugs = links.map((l) => linkMap[l]).filter(Boolean);
    start(async () => setCards(await cardsForCategories(slugs)));
  }

  return (
    <div>
      <div className="panel">
        <div className="tree-q">{n.q}</div>
        {n.text && <p style={{ marginTop: 10, whiteSpace: "pre-line" }}>{n.text}</p>}
        {n.opts && (
          <div className="tree-opts">
            {n.opts.map(([label, to]) => (
              <button key={to + label} className="btn" onClick={() => go(to)}>
                {label} →
              </button>
            ))}
          </div>
        )}
        {n.links && n.links.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div className="eyebrow">Related services</div>
            <div className="chips">
              {n.links.map((l) => (
                <span className="pill" key={l}>
                  {l}
                </span>
              ))}
            </div>
            <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => showServices(n.links!)} disabled={pending}>
              {pending ? "Loading…" : "Show these services"}
            </button>
          </div>
        )}
        <div className="btn-row" style={{ marginTop: 16 }}>
          {path.length > 1 && (
            <button className="btn btn-ghost" onClick={() => (setCards(null), setPath((p) => p.slice(0, -1)))}>
              ← Back
            </button>
          )}
          {path.length > 1 && (
            <button className="btn btn-ghost" onClick={() => (setCards(null), setPath(["start"]))}>
              Start over
            </button>
          )}
        </div>
      </div>
      {cards && (
        <section>
          {!cards.length && <p className="muted">No services listed yet for this step.</p>}
          {cards.map((s) => (
            <ServiceCardView key={s.id} s={s} volunteer />
          ))}
        </section>
      )}
    </div>
  );
}
