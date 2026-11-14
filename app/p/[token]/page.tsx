import { notFound } from "next/navigation";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { getPlanByToken } from "@/lib/plans";
import { getCatalog } from "@/lib/catalog";
import { getCurrentUser } from "@/lib/session";
import { scheduleSummary } from "@/lib/hours";
import { TIER_LABEL } from "@/lib/fields";
import type { ScheduleSpan } from "@/lib/db/schema";
import { PlanActions } from "@/components/PlanActions";

export const metadata = { title: "Support plan", robots: { index: false, follow: false } };

export default async function SharedPlan({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ layout?: string; saved?: string }> }) {
  const { token } = await params;
  const { layout = "letter", saved } = await searchParams;
  const plan = await getPlanByToken(token);
  if (!plan) notFound();
  const [c, user, h] = await Promise.all([getCatalog(), getCurrentUser(), headers()]);
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  const url = `${proto}://${host}/p/${token}`;
  const qr = await QRCode.toString(url, { type: "svg", margin: 0, errorCorrectionLevel: "M" });
  const isOwner = !!user && plan.ownerId === user.id;
  const created = new Date(plan.createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/Denver" });

  const rows = plan.items
    .map((it) => ({ it, s: c.serviceMap.get(it.serviceId) }))
    .filter((r) => r.s);

  return (
    <>
      {saved && <div className="ok no-print">Plan saved. Print it, share the link, or show the QR code.</div>}
      <PlanActions
        url={url}
        layout={layout}
        token={token}
        editable={isOwner || !plan.ownerId}
        planId={isOwner ? plan.id : ""}
        items={rows.map(({ it, s }) => ({ serviceId: it.serviceId, name: s!.name, tier: it.tier, note: it.note ?? undefined }))}
      />
      <article className={`plan-doc${layout === "receipt" ? " receipt" : ""}`}>
        <div className="eyebrow" style={{ color: "#444" }}>
          Boulder Feet Forward · Support plan
        </div>
        <h1>{plan.showLabel && plan.forLabel ? `Plan for ${plan.forLabel}` : "Your support plan"}</h1>
        <p style={{ color: "#444" }}>
          Made {created}
          {plan.navigatorName ? ` with ${plan.navigatorName}` : ""}. Hours can change — call ahead when you can.
        </p>
        {isOwner && plan.forLabel && !plan.showLabel && <p className="no-print small muted">For: {plan.forLabel} (only you can see this)</p>}
        {plan.note && <p className="note">{plan.note}</p>}

        {([1, 2, 3] as const).map((t) => {
          const items = rows.filter((r) => r.it.tier === t);
          if (!items.length) return null;
          return (
            <section key={t} style={{ marginTop: 18 }}>
              <div className={`tier-head tier-${t}`}>
                <span className="tier-num">{t}</span>
                <h2>{TIER_LABEL[t].title}</h2>
                <span style={{ color: "#555" }}>{TIER_LABEL[t].blurb}</span>
              </div>
              {items.map(({ it, s }) => {
                const sched = scheduleSummary(s!.schedule as ScheduleSpan[] | null);
                return (
                  <div className="item" key={it.id}>
                    <h3>
                      {s!.preferred ? "★ " : ""}
                      {s!.name}
                    </h3>
                    {s!.phone && <div className="phone">☎ {s!.phone}</div>}
                    {(sched || s!.hoursText) && <div>🕑 {sched || s!.hoursText}</div>}
                    {s!.address && <div>📍 {s!.address}</div>}
                    {s!.access && <div>{s!.access}</div>}
                    {s!.fieldNotes && <div style={{ color: "#333" }}>What to expect: {s!.fieldNotes}</div>}
                    {s!.petPolicy && <div>🐾 Pets: {s!.petPolicy}</div>}
                    {s!.rules && <div>Rules: {s!.rules}</div>}
                    {s!.url && layout !== "receipt" && <div style={{ wordBreak: "break-all" }}>🌐 {s!.url.replace(/^https?:\/\//, "")}</div>}
                    {it.note && <div className="note">✎ {it.note}</div>}
                  </div>
                );
              })}
            </section>
          );
        })}

        <div className="plan-foot">
          <div className="qr" dangerouslySetInnerHTML={{ __html: qr }} aria-label="QR code linking to this plan" />
          <div>
            <b>Scan to open this plan on a phone.</b>
            <div style={{ fontSize: 14, wordBreak: "break-all" }}>{url}</div>
            <div style={{ marginTop: 6 }}>
              Crisis or thinking about suicide: call/text <b>988</b>. Emergency: <b>911</b>.
            </div>
            <div>BFF navigators: Central Park SE corner · Tue 2:30pm · Fri 11am</div>
          </div>
        </div>
      </article>
    </>
  );
}
