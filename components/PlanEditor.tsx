"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { usePlan } from "./PlanProvider";
import { getCards, savePlanAction } from "@/app/actions";
import type { ServiceCard } from "@/lib/dto";
import { TIER_LABEL } from "@/lib/fields";

export function PlanEditor({ signedIn, volunteer, navigatorName }: { signedIn: boolean; volunteer: boolean; navigatorName?: string }) {
  const plan = usePlan();
  const router = useRouter();
  const [cards, setCards] = useState<Record<string, ServiceCard>>({});
  const [tags, setTags] = useState("");
  const [showLabel, setShowLabel] = useState(false);
  const [navName, setNavName] = useState(navigatorName ?? "");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ids = plan.basket.items.map((i) => i.serviceId).join(",");

  useEffect(() => {
    if (!ids) return;
    getCards(ids.split(",")).then((cs) => setCards(Object.fromEntries(cs.map((c) => [c.id, c]))));
  }, [ids]);

  if (!plan.ready) return null;
  if (!plan.basket.items.length)
    return (
      <div className="panel">
        <p>This plan is empty. Find services and tap <b>+ Add</b> to build a plan.</p>
        <Link className="btn btn-primary" href={volunteer ? "/navigator" : "/help"}>
          Find help
        </Link>
      </div>
    );

  function save() {
    setErr(null);
    start(async () => {
      try {
        const r = await savePlanAction({
          planId: plan.basket.planId,
          items: plan.basket.items.map(({ serviceId, tier, note }) => ({ serviceId, tier, note })),
          forLabel: plan.basket.forLabel,
          showLabel,
          tags,
          navigatorName: navName,
          note,
          intakeText: volunteer ? plan.basket.intakeText : undefined,
        });
        plan.setMeta({ planId: signedIn ? r.id : null });
        router.push(`/p/${r.token}?saved=1`);
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  }

  return (
    <div>
      {([1, 2, 3] as const).map((t) => {
        const items = plan.basket.items.filter((i) => i.tier === t);
        if (!items.length) return null;
        return (
          <section className="tier" key={t}>
            <div className={`tier-head tier-${t}`}>
              <span className="tier-num">{t}</span>
              <h2>{TIER_LABEL[t].title}</h2>
              <span className="muted">{TIER_LABEL[t].blurb}</span>
            </div>
            {items.map((i) => {
              const c = cards[i.serviceId];
              return (
                <div className="svc" key={i.serviceId}>
                  <div className="svc-top">
                    <h3>{i.name}</h3>
                    <button className="btn btn-sm btn-danger" onClick={() => plan.remove(i.serviceId)} aria-label={`Remove ${i.name}`}>
                      Remove
                    </button>
                  </div>
                  {c && (
                    <div className="facts">
                      <span className={`status ${c.open.state}`}>{c.open.label}</span>
                      {c.schedule && <span>🕑 {c.schedule}</span>}
                      {c.phone && <span>📞 {c.phone}</span>}
                    </div>
                  )}
                  <div className="grid2" style={{ marginTop: 8 }}>
                    <div>
                      <label className="small" htmlFor={`note-${i.serviceId}`}>
                        Note for this step <span className="hint">(printed)</span>
                      </label>
                      <input
                        id={`note-${i.serviceId}`}
                        type="text"
                        value={i.note ?? ""}
                        placeholder="e.g. Ask for Maria, bring your citation"
                        onChange={(e) => plan.update(i.serviceId, { note: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="small" htmlFor={`tier-${i.serviceId}`}>
                        When
                      </label>
                      <select id={`tier-${i.serviceId}`} value={i.tier} onChange={(e) => plan.update(i.serviceId, { tier: +e.target.value })}>
                        <option value={1}>Right now</option>
                        <option value={2}>Next time</option>
                        <option value={3}>Long term</option>
                      </select>
                    </div>
                  </div>
                </div>
              );
            })}
          </section>
        );
      })}

      <section className="panel" style={{ marginTop: 24 }}>
        <h2>{volunteer ? "Save & share" : "Get your plan"}</h2>
        {volunteer && (
          <>
            <div className="field">
              <label htmlFor="forLabel">
                Who is this for? <span className="hint">Nickname or initials only — never a full name.</span>
              </label>
              <input id="forLabel" type="text" maxLength={60} value={plan.basket.forLabel ?? ""} onChange={(e) => plan.setMeta({ forLabel: e.target.value })} />
              <label className="check">
                <input type="checkbox" checked={showLabel} onChange={(e) => setShowLabel(e.target.checked)} /> Print the nickname on the plan
              </label>
            </div>
            <div className="grid2">
              <div className="field">
                <label htmlFor="navName">Your first name (printed so they can ask for you)</label>
                <input id="navName" type="text" maxLength={40} value={navName} onChange={(e) => setNavName(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="tags">
                  Tags <span className="hint">comma-separated, e.g. “central park, follow up”</span>
                </label>
                <input id="tags" type="text" value={tags} onChange={(e) => setTags(e.target.value)} />
              </div>
            </div>
          </>
        )}
        <div className="field">
          <label htmlFor="note">A note at the top of the plan (optional)</label>
          <textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} style={{ minHeight: 80 }} placeholder="e.g. Start with Coordinated Entry on Tuesday morning." />
        </div>
        {err && <div className="notice">{err}</div>}
        <div className="btn-row">
          <button className="btn btn-primary" onClick={save} disabled={pending}>
            {pending ? "Saving…" : signedIn ? "Save plan & get link" : "Make my plan"}
          </button>
          <button className="btn btn-ghost" onClick={() => confirm("Clear this plan?") && plan.clear()}>
            Clear
          </button>
        </div>
        {!signedIn && (
          <p className="small muted" style={{ marginTop: 10 }}>
            You’ll get a private link you can print, screenshot or save. <Link href="/login?next=/plan">Sign in</Link> to keep your plans in one place.
          </p>
        )}
      </section>
    </div>
  );
}
