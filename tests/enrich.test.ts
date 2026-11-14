import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createFetcher, htmlToText, parsePage, parseRobots, robotsAllows, USER_AGENT, type FetchedPage } from "../lib/enrich/fetch";
import { extractDeterministic, jsonLdHours } from "../lib/enrich/extract-deterministic";
import { extractWithLlm, type LlmClient } from "../lib/enrich/extract-llm";
import { BASE_CONFIDENCE, pageFreshness, pageMentionsService, verifyCandidates } from "../lib/enrich/verify";
import { buildProposal } from "../lib/enrich/propose";
import { scoreService } from "../lib/enrich/verify-queue";
import type { Candidate } from "../lib/enrich/types";
import { parseHours, scheduleSummary } from "../lib/hours";
import { mergeDetails } from "../lib/details";
import type { schema as Schema } from "../lib/db";

const NOW = new Date("2026-11-14T12:00:00Z");
const html = (name: string) => readFileSync(path.join(__dirname, "fixtures/enrich", `${name}.html`), "utf8");
const page = (name: string, url = `https://example.org/${name}`) => parsePage(html(name), url);

type Svc = typeof Schema.services.$inferSelect;
function svc(over: Partial<Svc> = {}): Svc {
  return {
    id: "s_test",
    name: "Foothills Community Pantry",
    organization: null,
    summary: null,
    access: null,
    fieldNotes: null,
    internalNotes: null,
    phone: null,
    url: "https://pantry.example.org/",
    email: null,
    address: null,
    lat: null,
    lng: null,
    hoursText: null,
    schedule: null,
    eligibility: null,
    petPolicy: null,
    police: null,
    rules: null,
    rulesUrl: null,
    preferred: false,
    status: "active",
    startsAt: null,
    endsAt: null,
    verifiedAt: null,
    verifiedBy: null,
    verificationNote: null,
    fieldSources: {},
    lockedFields: [],
    externalIds: {},
    lastSeenAt: null,
    details: {},
    sourcePageHash: null,
    sourceCheckedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

const llmCand = (p: FetchedPage, field: string, value: Candidate["value"], quote: string): Candidate => ({
  field: field as Candidate["field"],
  value,
  evidence: { url: p.url, quote, method: "llm" },
});

/** Fake Messages API client returning fixed facts. */
function fakeLlm(facts: { field: string; value: string; quote: string }[]): LlmClient & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    calls,
    messages: {
      create: async (body: unknown) => {
        calls.push(body);
        return { content: [{ type: "text", text: JSON.stringify({ facts }) }], stop_reason: "end_turn", usage: { input_tokens: 100, output_tokens: 50 } };
      },
    },
  } as unknown as LlmClient & { calls: unknown[] };
}

/* ───────────────────────── fetch ───────────────────────── */

describe("robots.txt", () => {
  const rules = parseRobots(`User-agent: *\nDisallow: /private\nAllow: /private/ok\n\nUser-agent: SomeBot\nDisallow: /`);
  it("applies longest match, Allow winning ties", () => {
    expect(robotsAllows(rules, "/")).toBe(true);
    expect(robotsAllows(rules, "/private/x")).toBe(false);
    expect(robotsAllows(rules, "/private/ok/page")).toBe(true);
  });
  it("uses our own group over *", () => {
    const r = parseRobots(`User-agent: *\nDisallow: /\n\nUser-agent: BFF-Navigator-Enricher\nAllow: /\nDisallow: /admin`);
    expect(robotsAllows(r, "/services")).toBe(true);
    expect(robotsAllows(r, "/admin/x")).toBe(false);
  });
  it("supports * and $ wildcards", () => {
    const r = parseRobots(`User-agent: *\nDisallow: /*.pdf$`);
    expect(robotsAllows(r, "/files/a.pdf")).toBe(false);
    expect(robotsAllows(r, "/files/a.pdf.html")).toBe(true);
  });
});

function server(routes: Record<string, (req: Request) => Response>) {
  const calls: { url: string; ua: string | null }[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, ua: new Headers(init?.headers).get("user-agent") });
    const u = new URL(url);
    const h = routes[u.origin + u.pathname] ?? routes[u.pathname];
    return h ? h(new Request(url)) : new Response("not found", { status: 404 });
  }) as typeof fetch;
  return { impl, calls };
}
const htmlRes = (body: string, headers: Record<string, string> = {}) => new Response(body, { status: 200, headers: { "content-type": "text/html; charset=utf-8", ...headers } });

describe("polite fetcher", () => {
  it("sends our User-Agent, respects robots.txt and returns parsed content", async () => {
    const s = server({
      "/robots.txt": () => new Response("User-agent: *\nDisallow: /staff", { status: 200 }),
      "/": () => htmlRes(html("jsonld")),
      "/staff": () => htmlRes("<p>secret</p>"),
    });
    const fetchPage = createFetcher({ fetchImpl: s.impl, sleep: async () => {} });
    const ok = await fetchPage("https://pantry.example.org/");
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.jsonLd.some((n) => n["@type"] === "FoodEstablishment")).toBe(true);
      expect(ok.hash).toMatch(/^[0-9a-f]{64}$/);
      expect(ok.tel.map((t) => t.value)).toEqual(["+13035550142"]); // nav tel: link excluded
    }
    const blocked = await fetchPage("https://pantry.example.org/staff");
    expect(blocked).toMatchObject({ ok: false, reason: "robots" });
    expect(s.calls.every((c) => c.ua === USER_AGENT)).toBe(true);
    expect(s.calls.filter((c) => c.url.endsWith("/robots.txt"))).toHaveLength(1); // cached per origin
  });

  it("waits 1 second between requests to the same host", async () => {
    let t = 0;
    const waits: number[] = [];
    const s = server({ "/robots.txt": () => new Response("", { status: 404 }), "/a": () => htmlRes("<p>a</p>"), "/b": () => htmlRes("<p>b</p>") });
    const fetchPage = createFetcher({ fetchImpl: s.impl, now: () => t, sleep: async (ms) => void (waits.push(ms), (t += ms)) });
    await fetchPage("https://x.example.org/a");
    t += 200;
    await fetchPage("https://x.example.org/b");
    expect(waits.length).toBeGreaterThanOrEqual(2);
    expect(waits.every((w) => w > 0 && w <= 1000)).toBe(true);
  });

  it("follows up to 3 redirects, then gives up", async () => {
    const hop = (to: string) => () => new Response(null, { status: 301, headers: { location: to } });
    const s = server({ "/robots.txt": () => new Response("", { status: 404 }), "/1": hop("/2"), "/2": hop("/3"), "/3": hop("/4"), "/4": hop("/5"), "/5": () => htmlRes("<p>end</p>") });
    const fetchPage = createFetcher({ fetchImpl: s.impl, sleep: async () => {} });
    expect(await fetchPage("https://r.example.org/2")).toMatchObject({ ok: true, url: "https://r.example.org/5" });
    expect(await fetchPage("https://r.example.org/1")).toMatchObject({ ok: false, reason: "too-many-redirects" });
  });

  it("caps bodies at 2MB, refuses non-HTML and treats a robots.txt 5xx as disallow", async () => {
    const big = "<p>" + "x".repeat(3 * 1024 * 1024) + "</p>";
    const s = server({
      "https://a.example.org/robots.txt": () => new Response("", { status: 404 }),
      "https://a.example.org/big": () => htmlRes(big),
      "https://a.example.org/doc.pdf": () => new Response("%PDF", { headers: { "content-type": "application/pdf" } }),
      "https://down.example.org/robots.txt": () => new Response("", { status: 503 }),
    });
    const fetchPage = createFetcher({ fetchImpl: s.impl, sleep: async () => {} });
    const r = await fetchPage("https://a.example.org/big");
    expect(r.ok && r.truncated).toBe(true);
    expect(await fetchPage("https://a.example.org/doc.pdf")).toMatchObject({ ok: false, reason: "not-html" });
    expect(await fetchPage("https://down.example.org/x")).toMatchObject({ ok: false, reason: "robots" });
  });

  it("turns HTML into clean text without nav, footer or scripts", () => {
    const { text } = htmlToText(html("prose"));
    expect(text).toContain("We are open Monday through Friday from 8:30 a.m. to 4 p.m.");
    expect(text).not.toMatch(/Fax|Lafayette|About|\.hero/);
  });
});

/* ───────────────────────── extraction ───────────────────────── */

describe("deterministic extraction", () => {
  it("reads schema.org JSON-LD with evidence", () => {
    const p = page("jsonld");
    const { candidates } = extractDeterministic(p);
    const ld = candidates.filter((c) => c.evidence.method === "jsonld");
    expect(ld.find((c) => c.field === "phone")?.value).toBe("303-555-0142");
    expect(ld.find((c) => c.field === "address")?.value).toBe("2150 Pearl St, Boulder, CO 80302");
    expect(ld.find((c) => c.field === "hoursText")?.value).toBe("Mon, Wed, Fri 10am–2pm");
    expect(ld.find((c) => c.field === "lat")?.value).toBe(40.0205);
    for (const c of candidates) expect(c.evidence.quote.length).toBeLessThanOrEqual(200);
  });

  it("parses openingHours strings", () => {
    expect(jsonLdHours({ openingHours: ["Mo-Fr 09:00-17:00", "Sa 10:00-12:00"] })).toHaveLength(6);
    expect(jsonLdHours({ openingHours: "Mo,We 10:00-14:00" }).map((s) => s.day)).toEqual([1, 3]);
  });

  it("round-trips hours summaries through parseHours", () => {
    for (const s of ["Mon–Fri 8:30am–4pm", "Mon, Wed, Fri 10am–2pm", "Tue, Thu 5pm–8pm"]) expect(scheduleSummary(parseHours(s))).toBe(s);
  });

  it("finds hours, phone, address and details in prose, ignoring footer and fax", () => {
    const { candidates, ambiguous } = extractDeterministic(page("prose"));
    const by = (f: string) => candidates.find((c) => c.field === f);
    expect(by("hoursText")?.value).toBe("Mon–Fri 8:30am–4pm");
    expect(by("phone")?.value).toBe("303-555-0177");
    expect(by("address")?.value).toBe("1100 Walnut Street, Boulder, CO 80302");
    expect(by("email")?.value).toBe("frontdesk@harbor.example.org");
    expect(by("details.ageRange")?.value).toBe("18+");
    expect(by("details.accessibility")?.value).toBe("Wheelchair accessible");
    expect(ambiguous).toHaveLength(0);
  });

  it("refuses to choose when a page lists several programs", () => {
    const { candidates, ambiguous } = extractDeterministic(page("misleading"));
    expect(candidates.find((c) => c.field === "hoursText")).toBeUndefined();
    expect(candidates.find((c) => c.field === "phone")).toBeUndefined();
    expect(ambiguous.map((a) => a.field).sort()).toEqual(["hoursText", "phone"]);
    // "bring a photo ID if you have one; we will still serve you without it" is not "ID required"
    expect(candidates.find((c) => c.field === "details.idRequired")).toBeUndefined();
  });
});

describe("LLM extraction (stubbed)", () => {
  it("asks for structured JSON with quotes and maps facts to candidates", async () => {
    const p = page("prose");
    const llm = fakeLlm([
      { field: "details.walkIn", value: "yes", quote: "Everyone is welcome to drop by." },
      { field: "details.walkIn", value: "no", quote: "duplicate field is ignored" },
      { field: "details.transit", value: "Two blocks from the downtown bus station, routes SKIP and HOP", quote: "two blocks from the downtown bus station (routes SKIP and HOP)" },
    ]);
    const { candidates } = await extractWithLlm(p, { name: "Harbor Day Center" }, { client: llm });
    expect(candidates).toHaveLength(2);
    expect(candidates.every((c) => c.evidence.method === "llm")).toBe(true);
    const body = llm.calls[0] as { output_config: { format: { type: string } }; system: string };
    expect(body.output_config.format.type).toBe("json_schema");
    expect(body.system).toMatch(/never|Omit anything implied/i);
  });

  it("returns nothing without a key or client", async () => {
    const prev = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    expect((await extractWithLlm(page("prose"), { name: "x" })).candidates).toEqual([]);
    if (prev) process.env.ANTHROPIC_API_KEY = prev;
  });
});

/* ───────────────────────── the verify gate ───────────────────────── */

describe("verify gate", () => {
  const ctx = (name: string) => ({ service: { name }, now: NOW });

  it("drops an LLM candidate whose quote is not on the page (misleading page)", () => {
    const p = page("misleading");
    const fabricated = llmCand(p, "hoursText", "Open 24/7", "Riverbend is open 24/7, no ID needed.");
    const fabricatedId = llmCand(p, "details.idRequired", "no", "No ID needed at Riverbend.");
    const r = verifyCandidates(p, [fabricated, fabricatedId], ctx("Riverbend Shelter"));
    expect(r.verified).toHaveLength(0);
    expect(r.dropped.map((d) => d.reason)).toEqual(["quote not found on the page", "quote not found on the page"]);
  });

  it("drops values their own quote doesn't support", () => {
    const p = page("misleading");
    const r = verifyCandidates(
      p,
      [
        llmCand(p, "phone", "303-555-0199", "Call the shelter line at 303-555-0190"),
        llmCand(p, "hoursText", "Mon–Fri 9am–5pm", "Shelter check-in: Daily 6pm-8pm."),
        llmCand(p, "address", "1200 Pearl St, Boulder", "Riverbend offers overnight shelter and a weekly food pantry."),
        llmCand(p, "details.idRequired", "yes", "we will still serve you without it"),
        llmCand(p, "details.cost", "Free with a small donation suggested", "Riverbend offers overnight shelter and a weekly food pantry."),
      ],
      ctx("Riverbend Shelter"),
    );
    expect(r.verified).toHaveLength(0);
    expect(r.dropped.map((d) => d.reason)).toEqual([
      "phone digits not in quote",
      "hours in quote differ from value",
      "street number/name not in quote",
      "quote isn't about ID required",
      "only 0% of the value's words are in the quote",
    ]);
  });

  it("catches a yes/no value that contradicts its quote", () => {
    const p = page("jsonld");
    const r = verifyCandidates(p, [llmCand(p, "details.idRequired", "yes", "No ID required.")], ctx("Foothills Community Pantry"));
    expect(r.dropped[0].reason).toBe("quote says the opposite");
  });

  it("matches quotes despite curly quotes, dashes and whitespace", () => {
    const p = page("jsonld");
    const c = llmCand(p, "details.walkIn", "yes", "Walk-ins   welcome - no appointment\nnecessary.");
    const r = verifyCandidates(p, [c], ctx("Foothills Community Pantry"));
    expect(r.verified).toHaveLength(1);
  });

  it("prunes list items the quote doesn't mention", () => {
    const p = page("jsonld");
    const r = verifyCandidates(p, [llmCand(p, "details.languages", "Spanish, French", "Se habla español.")], ctx("Foothills Community Pantry"));
    expect(r.verified[0].value).toEqual(["Spanish"]);
  });

  it("rejects too-short LLM quotes and JSON-LD quotes claimed as visible text", () => {
    const p = page("jsonld");
    const r = verifyCandidates(
      p,
      [llmCand(p, "details.walkIn", "yes", "welcome"), { field: "phone", value: "303-555-0142", evidence: { url: p.url, quote: '"+1-303-555-0142"', method: "pattern" } }],
      ctx("Foothills Community Pantry"),
    );
    expect(r.verified).toHaveLength(0);
    expect(r.dropped.every((d) => d.reason === "quote not found on the page")).toBe(true);
  });

  it("drops irregular schedules for a person to check", () => {
    const p = parsePage("<h1>Sister Carmen Pantry</h1><p>Pantry open the first Tuesday of the month, 1pm-3pm.</p>", "https://x.org/");
    const r = verifyCandidates(p, [llmCand(p, "hoursText", "Tue 1pm–3pm", "Pantry open the first Tuesday of the month, 1pm-3pm.")], ctx("Sister Carmen Pantry"));
    expect(r.dropped[0].reason).toMatch(/irregular/);
  });

  it("scores jsonld > pattern > llm, boosts corroboration and penalises stale pages", () => {
    expect(BASE_CONFIDENCE.jsonld).toBeGreaterThan(BASE_CONFIDENCE.pattern);
    expect(BASE_CONFIDENCE.pattern).toBeGreaterThan(BASE_CONFIDENCE.llm);
    const p = page("jsonld");
    const det = extractDeterministic(p).candidates;
    const r = verifyCandidates(p, det, ctx("Foothills Community Pantry"));
    const phone = r.verified.filter((c) => c.field === "phone");
    expect(phone.find((c) => c.evidence.method === "jsonld")?.signals).toContain("corroborated:pattern");
    expect(phone.find((c) => c.evidence.method === "jsonld")!.confidence).toBeGreaterThan(BASE_CONFIDENCE.jsonld);

    const s = page("stale");
    const sDet = extractDeterministic(s).candidates;
    const sr = verifyCandidates(s, [...sDet, llmCand(s, "details.ageRange", "Adults", "uninsured adults")], ctx("Mapleton Free Clinic"));
    expect(sr.page.stale).toBe(true);
    const hours = sr.verified.find((c) => c.field === "hoursText")!;
    expect(hours.signals).toContain("stale-page");
    expect(hours.confidence).toBeCloseTo(BASE_CONFIDENCE.pattern - 0.25);
    expect(sr.dropped.find((d) => d.field === "details.ageRange")?.reason).toMatch(/low confidence/);
  });

  it("boosts values that match the current record", () => {
    const p = page("prose");
    const r = verifyCandidates(p, extractDeterministic(p).candidates, { ...ctx("Harbor Day Center"), current: { phone: "(303) 555-0177" } });
    expect(r.verified.find((c) => c.field === "phone")?.signals).toContain("matches-record");
  });

  it("drops everything when the page is not about this service", () => {
    const p = page("prose");
    const r = verifyCandidates(p, extractDeterministic(p).candidates, ctx("Longmont Senior Meals"));
    expect(r.page.mentionsService).toBe(false);
    expect(r.verified).toHaveLength(0);
    expect(r.dropped.length).toBeGreaterThan(0);
    expect(pageMentionsService(p, { name: "Harbor Day Center" })).toBe(true);
  });

  it("reads page dates from meta tags, 'Last updated' text and copyright", () => {
    expect(pageFreshness(page("jsonld"), NOW)).toMatchObject({ stale: false, source: "meta:article:modified_time" });
    expect(pageFreshness(page("stale"), NOW)).toMatchObject({ stale: true, datedAt: "2023-03-03T00:00:00.000Z" });
    expect(pageFreshness(parsePage("<p>© 2019 Old Site</p>", "https://x.org"), NOW).stale).toBe(true);
    expect(pageFreshness(page("prose"), NOW)).toMatchObject({ datedAt: null, stale: false });
  });
});

describe("traps seen on real provider pages", () => {
  const run = (body: string, name = "Test Service") => {
    const p = parsePage(`<html><head><title>${name}</title></head><body><main><h1>${name}</h1>${body}</main></body></html>`, "https://t.example.org/");
    const det = extractDeterministic(p);
    const r = verifyCandidates(p, det.candidates, { service: { name }, now: NOW });
    return { ...r, ambiguous: det.ambiguous, all: [...r.dropped, ...det.ambiguous] };
  };
  const hours = (r: ReturnType<typeof run>) => r.verified.find((c) => c.field === "hoursText");

  it("donation drop-off hours are not client hours", () => {
    const r = run("<p>Open donation hours:</p><p>Wed 10am - 1pm</p>");
    expect(hours(r)).toBeUndefined();
    expect(r.all.find((d) => d.field === "hoursText")?.reason).toMatch(/donations/);
  });
  it("hours for two locations are not proposed", () => {
    const r = run("<p>Boulder (3700 Baseline Road): Wed 10am - 1pm</p><p>Longmont (1325 Sherman Drive): Thurs 10am - 1pm</p>");
    expect(hours(r)).toBeUndefined();
  });
  it("'most Saturdays' and dated groups are irregular", () => {
    expect(hours(run("<p>Pantry open most Saturdays 10am-noon.</p>"))).toBeUndefined();
    const g = run("<p>Parenting Group</p><p>Weds 7-8pm starting October 14, 2026</p>", "Boulder Emotional Wellness");
    expect(hours(g)).toBeUndefined();
  });
  it("'24 hours' next to clock times, and 24/7 care, are not opening hours", () => {
    expect(hours(run("<p>Clinic Hours:</p><p>24 hours 5am - 1:30pm (MST)</p>"))).toBeUndefined();
    expect(hours(run("<p>Residential stays include 24/7 on-site medical supervision and hours of therapy.</p>"))).toBeUndefined();
    expect(hours(run("<p>Hours</p><p>24/7 - Always Available</p>"))?.value).toBe("24/7");
  });
  it("a testimonial mentioning Spanish is not a language offer", () => {
    const r = run("<p>I received a referral for a Spanish speaking mother who needed support.</p>");
    expect(r.verified.find((c) => c.field === "details.languages")).toBeUndefined();
    expect(run("<p>She had trouble finding a Spanish speaking therapist.</p>").verified.find((c) => c.field === "details.languages")).toBeUndefined();
    expect(run("<p>We have Spanish-speaking staff.</p>").verified.find((c) => c.field === "details.languages")?.value).toEqual(["Spanish"]);
  });
  it("a free consultation doesn't make a service free", () => {
    expect(run("<p>Initial phone consultations are always free.</p>").verified.find((c) => c.field === "details.cost")).toBeUndefined();
    expect(run("<p>All of our services are free.</p>").verified.find((c) => c.field === "details.cost")?.value).toBe("Free");
    expect(run("<p>We verify your coverage at no cost.</p>").verified.find((c) => c.field === "details.cost")).toBeUndefined();
  });
  it("an out-of-state headquarters address from JSON-LD is dropped", () => {
    const ld = { "@context": "https://schema.org", "@type": "MedicalOrganization", name: "Acme Recovery", address: { "@type": "PostalAddress", streetAddress: "100 N. Johnson Mill Rd", addressLocality: "Midway", addressRegion: "Utah", postalCode: "84049" } };
    const p = parsePage(`<html><head><script type="application/ld+json">${JSON.stringify(ld)}</script></head><body><h1>Acme Recovery Boulder</h1></body></html>`, "https://acme.example.org/");
    const r = verifyCandidates(p, extractDeterministic(p).candidates, { service: { name: "Acme Recovery - Boulder" }, now: NOW });
    expect(r.verified.find((c) => c.field === "address")).toBeUndefined();
    expect(r.dropped.find((c) => c.field === "address")?.reason).toBe("address is outside Colorado");
  });
  it("age ranges for one group are not the service's ages; age-only values check numbers", () => {
    expect(run("<p>A group for parents of adolescents (ages 12–18).</p>").verified.find((c) => c.field === "details.ageRange")).toBeUndefined();
    expect(run("<p>Our homes are for individuals aged 18-30.</p>").verified.find((c) => c.field === "details.ageRange")?.value).toBe("Ages 18–30");
  });
});

/* ───────────────────────── proposals ───────────────────────── */

describe("proposals", () => {
  const verified = (name: string, svcName: string, current: Svc) => {
    const p = page(name);
    return verifyCandidates(p, extractDeterministic(p).candidates, { service: { name: svcName }, now: NOW, current: current as never });
  };

  it("proposes empty fields with evidence and a plain-words summary", () => {
    const s = svc();
    const prop = buildProposal(s, verified("jsonld", s.name, s), NOW)!;
    expect(prop.payload.fields).toMatchObject({ phone: "303-555-0142", hoursText: "Mon, Wed, Fri 10am–2pm", address: "2150 Pearl St, Boulder, CO 80302", lat: 40.0205, lng: -105.2665 });
    expect(prop.payload.details).toEqual({ walkIn: true, appointmentRequired: false, idRequired: false, languages: ["Spanish"] });
    expect(prop.payload.evidence.phone).toMatchObject({ method: "jsonld", previous: null, url: "https://example.org/jsonld" });
    expect(prop.payload.evidence.phone.confidence).toBeGreaterThan(0.9);
    expect(prop.payload.conflicts).toEqual([]);
    expect(prop.summary).toBe("Website lists hours Mon, Wed, Fri 10am–2pm, phone 303-555-0142, address 2150 Pearl St, Boulder, CO 80302, walk-ins welcome, no appointment needed, no ID required and languages: Spanish.");
  });

  it("follows human-wins: skips person-set values unless high confidence, then flags the conflict", () => {
    const seed = { source: "seed:bff", at: "2025-01-01T00:00:00Z" };
    const s = svc({ phone: "303-555-0000", hoursText: "Tue 9am–11am", details: { walkIn: false }, fieldSources: { phone: seed, hoursText: seed, "details.walkIn": seed } });
    const prop = buildProposal(s, verified("jsonld", s.name, s), NOW)!;
    // JSON-LD phone & hours are high confidence → proposed but flagged
    expect(prop.payload.conflicts.sort()).toEqual(["hoursText", "phone"]);
    expect(prop.payload.evidence.phone).toMatchObject({ conflictsWithFieldNotes: true, previous: "303-555-0000" });
    // pattern-only walk-in (0.75) does not override a person's note
    expect(prop.payload.details.walkIn).toBeUndefined();
    expect(prop.decisions.find((d) => d.field === "details.walkIn")?.action).toBe("skip");
    expect(prop.summary).toMatch(/^Conflicts with field notes \(hours, phone\)\. Website lists/);
  });

  it("never touches locked fields and skips values that already match", () => {
    const s = svc({ phone: "(303) 555-0142", lockedFields: ["hoursText", "details"] });
    const prop = buildProposal(s, verified("jsonld", s.name, s), NOW)!;
    expect(prop.payload.fields.hoursText).toBeUndefined();
    expect(prop.payload.fields.phone).toBeUndefined();
    expect(prop.payload.details).toEqual({});
    expect(prop.decisions.find((d) => d.field === "phone")?.why).toBe("already matches");
  });

  it("says when the page looks out of date", () => {
    const s = svc({ name: "Mapleton Free Clinic" });
    const prop = buildProposal(s, verified("stale", s.name, s), NOW)!;
    expect(prop.payload.page.stale).toBe(true);
    expect(prop.summary).toMatch(/Page last updated Mar 2023, so it may be out of date\.$/);
  });
});

describe("details helpers & verify queue", () => {
  it("merges details, coercing kinds and clearing with null", () => {
    const m = mergeDetails({ walkIn: false, cost: "Free" }, { walkIn: "yes", languages: "Spanish, Vietnamese", cost: null, bogus: 1 });
    expect(m.details).toEqual({ walkIn: true, languages: ["Spanish", "Vietnamese"] });
    expect(m.changed.sort()).toEqual(["cost", "languages", "walkIn"]);
  });

  it("ranks heavily planned, never-verified, sparse services first", () => {
    const sparse = scoreService(svc(), 12, NOW);
    const fresh = scoreService(svc({ verifiedAt: new Date("2026-10-01"), phone: "1", hoursText: "Mon 9am", address: "x", details: { walkIn: true, cost: "Free", idRequired: false } }), 12, NOW);
    const unused = scoreService(svc(), 0, NOW);
    expect(sparse.score).toBeGreaterThan(unused.score);
    expect(sparse.score).toBeGreaterThan(fresh.score);
    expect(sparse.reason).toBe("On 12 plans · never checked in person · missing hours, phone, address, walk-ins, cost, ID needed");
  });
});

/* ───────────────────────── end to end on an in-memory database ───────────────────────── */

describe("runner (in-memory Postgres)", () => {
  let db: typeof import("../lib/db");
  let services: typeof import("../lib/services");
  let runner: typeof import("../lib/enrich/runner");
  let eq: typeof import("drizzle-orm").eq;

  beforeAll(async () => {
    delete process.env.DATABASE_URL;
    delete process.env.ANTHROPIC_API_KEY;
    process.env.PGLITE_DIR = ":memory:";
    db = await import("../lib/db");
    services = await import("../lib/services");
    runner = await import("../lib/enrich/runner");
    eq = (await import("drizzle-orm")).eq;
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    await migrate(db.getDb() as never, { migrationsFolder: path.join(__dirname, "../drizzle") });
  }, 60_000);

  it("applyServiceChange merges details and records details.<key> provenance (backward compatible)", async () => {
    const id = await services.applyServiceChange({ kind: "create", payload: { fields: { name: "Detail Test" } }, actor: "seed:bff" });
    let [row] = await db.getDb().select().from(db.schema.services).where(eq(db.schema.services.id, id));
    expect(row.details).toEqual({});
    await services.applyServiceChange({ kind: "update", serviceId: id, payload: { details: { walkIn: true, languages: ["Spanish"] } }, actor: "admin:libby" });
    await services.applyServiceChange({ kind: "update", serviceId: id, payload: { fields: { phone: "303-555-0101" } }, actor: "volunteer:v1" });
    [row] = await db.getDb().select().from(db.schema.services).where(eq(db.schema.services.id, id));
    expect(row.details).toEqual({ walkIn: true, languages: ["Spanish"] });
    expect(row.fieldSources["details.walkIn"].source).toBe("admin:libby");
    expect(row.fieldSources.phone.source).toBe("volunteer:v1");
    await services.applyServiceChange({ kind: "update", serviceId: id, payload: { details: { walkIn: null } }, actor: "admin:libby" });
    [row] = await db.getDb().select().from(db.schema.services).where(eq(db.schema.services.id, id));
    expect(row.details).toEqual({ languages: ["Spanish"] });
  });

  it("queues one reviewable suggestion, dedupes, notices page changes, and approval applies it", async () => {
    const d = db.getDb();
    const S = db.schema;
    await d.insert(S.services).values([
      { id: "s_pantry", name: "Foothills Community Pantry", url: "https://pantry.example.org/", fieldSources: {} },
      { id: "s_gone", name: "Closed Place", url: "https://gone.example.org/", status: "inactive" },
    ]);
    let body = html("jsonld");
    const s = server({ "/robots.txt": () => new Response("", { status: 404 }), "https://pantry.example.org/": () => htmlRes(body) });
    const run = (o: Parameters<typeof runner.runEnrichment>[0] = {}) => runner.runEnrichment({ fetchImpl: s.impl, sleep: async () => {}, llm: false, now: NOW, ...o });

    const dry = await run({ dryRun: true, serviceId: "s_pantry" });
    expect(dry.outcomes[0].status).toBe("proposed");
    expect(await d.select().from(S.changeRequests)).toHaveLength(0);

    const first = await run();
    expect(first.stats).toMatchObject({ checked: 1, proposed: 1 }); // inactive skipped
    const crs = await d.select().from(S.changeRequests).where(eq(S.changeRequests.source, "enrich:web"));
    expect(crs).toHaveLength(1);
    expect(crs[0]).toMatchObject({ kind: "update", serviceId: "s_pantry", status: "pending" });
    const payload = crs[0].payload as { evidence: Record<string, { quote: string; method: string; confidence: number }> };
    expect(payload.evidence.hoursText.method).toBe("jsonld");
    const [svcRow] = await d.select().from(S.services).where(eq(S.services.id, "s_pantry"));
    expect(svcRow.sourcePageHash).toMatch(/^[0-9a-f]{64}$/);
    expect(svcRow.sourceCheckedAt).not.toBeNull();
    const runs = await d.select().from(S.ingestRuns).where(eq(S.ingestRuns.source, "enrich:web"));
    expect(runs[0]).toMatchObject({ status: "ok" });

    const second = await run({ serviceId: "s_pantry" });
    expect(second.outcomes[0].status).toBe("duplicate");
    expect(await d.select().from(S.changeRequests)).toHaveLength(1);

    // Libby approves → record updated, details merged, provenance is hers
    await services.approveChangeRequest(crs[0].id, "libby");
    const [after] = await d.select().from(S.services).where(eq(S.services.id, "s_pantry"));
    expect(after.phone).toBe("303-555-0142");
    expect(after.schedule).toEqual(parseHours("Mon, Wed, Fri 10am–2pm"));
    expect(after.details).toMatchObject({ walkIn: true, idRequired: false, languages: ["Spanish"] });
    expect(after.fieldSources["details.walkIn"].source).toBe("admin:libby");

    // Page text changes but nothing extractable does → one notice, not repeated within 30 days
    body = body.replace("Free groceries", "Fresh produce and free groceries");
    const third = await run({ serviceId: "s_pantry" });
    expect(third.outcomes[0].status).toBe("notice");
    body = body.replace("Fresh produce", "Fresh local produce");
    const fourth = await run({ serviceId: "s_pantry" });
    expect(fourth.outcomes[0].status).toBe("nothing-new");
    const notices = await d.select().from(S.changeRequests).where(eq(S.changeRequests.kind, "notice"));
    expect(notices).toHaveLength(1);
    expect(notices[0].summary).toMatch(/^Provider page changed — worth a quick check/);
  });
});
