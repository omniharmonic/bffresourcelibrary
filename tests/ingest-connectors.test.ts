import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import categoriesJson from "../data/seed/categories.json";
import type { FeedRecord } from "../lib/ingest/types";
import { connectors } from "../lib/ingest/connectors";
import { bococDropboxes } from "../lib/ingest/connectors/bococ-dropboxes";
import { bococNaloxone } from "../lib/ingest/connectors/bococ-naloxone";
import { cityWifi } from "../lib/ingest/connectors/city-wifi";
import { findTreatment } from "../lib/ingest/connectors/findtreatment";
import { allroadsGuide } from "../lib/ingest/connectors/allroads-guide";
import { formatAddress, formatPhone, queryArcGISLayer, toLngLat } from "../lib/ingest/connectors/arcgis";

const SLUGS = new Set((categoriesJson as { slug: string }[]).map((c) => c.slug));
const fixture = (name: string) => JSON.parse(readFileSync(path.join(__dirname, "fixtures/ingest", name), "utf8"));

/** fetch stub that serves one body (or a function of the URL) and records URLs. */
function stubFetch(body: unknown | ((url: URL) => unknown)) {
  const calls: URL[] = [];
  const impl = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    calls.push(url);
    const b = typeof body === "function" ? (body as (u: URL) => unknown)(url) : body;
    return new Response(JSON.stringify(b), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { impl, calls };
}

function expectWellFormed(records: FeedRecord[]) {
  const ids = new Set<string>();
  for (const r of records) {
    expect(r.externalId).toMatch(/^[a-z0-9-]+$/);
    expect(ids.has(r.externalId)).toBe(false);
    ids.add(r.externalId);
    expect(r.fields.name.trim().length).toBeGreaterThan(0);
    expect(typeof r.fields.lat).toBe("number");
    expect(typeof r.fields.lng).toBe("number");
    // Boulder County-ish bounding box
    expect(r.fields.lat!).toBeGreaterThan(39.8);
    expect(r.fields.lat!).toBeLessThan(40.3);
    expect(r.fields.lng!).toBeGreaterThan(-105.7);
    expect(r.fields.lng!).toBeLessThan(-104.9);
    expect(r.categories.length).toBeGreaterThan(0);
    for (const c of r.categories) expect(SLUGS.has(c)).toBe(true);
    if (r.fields.phone) expect(r.fields.phone).toMatch(/^\d{3}-\d{3}-\d{4}( x\d+)?$/);
    expect(r.fields.summary).toBeTruthy();
  }
}

describe("connector registry", () => {
  it("exports all v1 connectors with unique ids", () => {
    const ids = connectors.map((c) => c.id);
    expect(ids).toEqual(["bococ-dropboxes", "bococ-naloxone", "city-wifi", "findtreatment", "allroads-guide"]);
    for (const c of connectors) expect(c.sourceUrl).toMatch(/^https:\/\//);
    expect(ids.join(" ")).not.toMatch(/samps|encamp/i);
  });
});

describe("arcgis helper", () => {
  it("sends the standard query and follows exceededTransferLimit with resultOffset", async () => {
    const { impl, calls } = stubFetch((u: URL) => {
      const off = Number(u.searchParams.get("resultOffset") ?? 0);
      if (off === 0) return { features: [{ attributes: { OBJECTID: 1 }, geometry: { x: -105.2, y: 40 } }, { attributes: { OBJECTID: 2 }, geometry: { x: -105.3, y: 40.1 } }], exceededTransferLimit: true };
      return { features: [{ attributes: { OBJECTID: 3 }, geometry: null }] };
    });
    const feats = await queryArcGISLayer("https://example.test/arcgis/rest/services/X/MapServer/0/", { fetchImpl: impl });
    expect(feats).toHaveLength(3);
    expect(feats[0]).toEqual({ attributes: { OBJECTID: 1 }, lng: -105.2, lat: 40 });
    expect(feats[2].lat).toBeUndefined();
    expect(calls).toHaveLength(2);
    expect(calls[0].pathname).toBe("/arcgis/rest/services/X/MapServer/0/query");
    expect(calls[0].searchParams.get("where")).toBe("1=1");
    expect(calls[0].searchParams.get("outFields")).toBe("*");
    expect(calls[0].searchParams.get("outSR")).toBe("4326");
    expect(calls[0].searchParams.get("f")).toBe("json");
    expect(calls[1].searchParams.get("resultOffset")).toBe("2");
  });

  it("throws on an ArcGIS error payload", async () => {
    const { impl } = stubFetch({ error: { code: 400, message: "Invalid query" } });
    await expect(queryArcGISLayer("https://example.test/x/MapServer/0", { fetchImpl: impl })).rejects.toThrow(/Invalid query/);
  });

  it("computes a polygon centroid", () => {
    const c = toLngLat({ rings: [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]] });
    expect(c).toEqual([1, 1]);
  });

  it("formats addresses and phones", () => {
    expect(formatAddress({ street: "2425 Canyon Boulevard", street2: "Suite 250", city: "Boulder", state: "CO", zip: "80302" })).toBe(
      "2425 Canyon Boulevard Suite 250, Boulder, CO 80302",
    );
    expect(formatAddress({ street: "1000 Canyon Blvd", city: "Boulder" })).toBe("1000 Canyon Blvd, Boulder, CO");
    expect(formatPhone("(303)651-8555")).toBe("303-651-8555");
    expect(formatPhone("720-739-6500 x1")).toBe("720-739-6500 x1");
    expect(formatPhone("(303) 413-628")).toBeUndefined(); // truncated in source
  });
});

describe("bococ-dropboxes", () => {
  it("keeps only syringe-disposal sites and maps fields", async () => {
    const { impl } = stubFetch(fixture("bococ-dropboxes.json"));
    const { records } = await bococDropboxes.fetch({ fetchImpl: impl });
    expectWellFormed(records);
    // fixture: 5 rows, 2 with Syringe=Y (HazMat facility, Works Program BCAP)
    expect(records.map((r) => r.fields.name).sort()).toEqual(["Hazardous Materials Management Facility", "Works Program - Boulder County AIDS Project"]);
    const hm = records.find((r) => r.fields.name.startsWith("Hazardous"))!;
    expect(hm.externalId).toBe("hazardous-materials-management-facility-1901-63rd-st-boulder-co-80301");
    expect(hm.fields.address).toBe("1901 63rd St, Boulder, CO 80301");
    expect(hm.fields.phone).toBe("720-564-2251");
    expect(hm.fields.access).toBe("Syringes accepted from everyone");
    expect(hm.categories).toEqual(["harm-reduction", "trash-bags-and-disposal"]);
    const works = records.find((r) => r.fields.name.startsWith("Works"))!;
    expect(works.fields.eligibility).toMatch(/Works clients/);
  });

  it("produces stable external ids across runs", async () => {
    const a = await bococDropboxes.fetch({ fetchImpl: stubFetch(fixture("bococ-dropboxes.json")).impl });
    const b = await bococDropboxes.fetch({ fetchImpl: stubFetch(fixture("bococ-dropboxes.json")).impl });
    expect(a.records.map((r) => r.externalId)).toEqual(b.records.map((r) => r.externalId));
  });
});

describe("bococ-naloxone", () => {
  it("maps pharmacies", async () => {
    const { impl } = stubFetch(fixture("bococ-naloxone.json"));
    const { records } = await bococNaloxone.fetch({ fetchImpl: impl });
    expect(records).toHaveLength(3);
    expectWellFormed(records);
    const t = records.find((r) => r.fields.name === "Target")!;
    expect(t.fields.address).toBe("2800 Pearl St, Boulder, CO 80301");
    expect(t.fields.phone).toBe("303-449-3400");
    expect(t.fields.access).toMatch(/Call ahead/);
    expect(t.fields.summary).toBe("Pharmacy that carries naloxone (Narcan). Ask at the pharmacy counter.");
    expect(t.categories).toEqual(["harm-reduction"]);
  });
});

describe("city-wifi", () => {
  it("merges polygons per facility and uses centroids", async () => {
    const { impl } = stubFetch(fixture("city-wifi.json"));
    const { records } = await cityWifi.fetch({ fetchImpl: impl });
    expectWellFormed(records);
    // fixture: Boulder Reservoir ×2, Main Library, Civic Area East (no address), Stazio Maintenance
    expect(records).toHaveLength(4);
    const lib = records.find((r) => r.fields.name === "Main Library")!;
    expect(lib.externalId).toBe("main-library-1000-canyon-blvd");
    expect(lib.fields.address).toBe("1000 Canyon Blvd, Boulder, CO");
    expect(lib.categories).toEqual(["technology-access", "free-and-friendly-public-spaces"]);
    const civic = records.find((r) => r.fields.name === "Civic Area East")!;
    expect(civic.fields.address).toBeUndefined();
    const stazio = records.find((r) => r.fields.name === "Stazio Maintenance")!;
    expect(stazio.categories).toEqual(["technology-access"]);
    expect(records.flatMap((r) => r.categories)).not.toContain("device-charging");
  });
});

describe("findtreatment", () => {
  it("merges SA/MH rows and maps service codes to categories", async () => {
    const { impl, calls } = stubFetch(fixture("findtreatment.json"));
    const { records } = await findTreatment.fetch({ fetchImpl: impl });
    expect(calls[0].searchParams.get("sAddr")).toBe("40.015,-105.27");
    expect(calls[0].searchParams.get("limitValue")).toBe("16093");
    expectWellFormed(records);
    expect(records).toHaveLength(3);

    const red = records.find((r) => r.fields.name === "Redpoint Center")!;
    expect(red.externalId).toBe("redpoint-center-2425-canyon-boulevard-80302");
    expect(red.fields.address).toBe("2425 Canyon Boulevard Suite 250, Boulder, CO 80302");
    expect(red.fields.phone).toBe("888-509-3153");
    expect(red.fields.url).toBe("https://www.theredpointcenter.com");
    expect(red.categories).toEqual(["sud-treatment", "medication-assisted-treatment-mat", "mental-and-behavioral-health-care"]);
    expect(red.fields.access).toMatch(/Medicaid/);

    const otp = records.find((r) => r.fields.name.startsWith("Denver Recovery Group"))!;
    expect(otp.categories).toEqual(["sud-treatment", "medication-assisted-treatment-mat"]);

    const bew = records.find((r) => r.fields.name === "Boulder Emotional Wellness")!;
    expect(bew.categories).toEqual(["mental-and-behavioral-health-care"]);
  });
});

describe("allroads-guide", () => {
  it("returns no records and a notice per file of the newest edition", async () => {
    const { impl, calls } = stubFetch(fixture("allroads-media.json"));
    const out = await allroadsGuide.fetch({ fetchImpl: impl });
    expect(calls[0].hostname).toBe("allroadsboco.org");
    expect(calls[0].pathname).toBe("/wp-json/wp/v2/media");
    expect(out.records).toEqual([]);
    expect(out.notices).toHaveLength(2);
    const keys = out.notices!.map((n) => n.key).sort();
    expect(keys).toEqual(["allroads-media:987499098", "allroads-media:987499099"]);
    const eng = out.notices!.find((n) => n.key.endsWith("098"))!;
    expect(eng.url).toBe("https://allroadsboco.org/wp-content/uploads/2026/10/August-2026-Resource-Guide-ENG-1.pdf");
    expect(eng.summary).toMatch(/August 2026 Resource Guide ENG/);
    expect(eng.summary).toMatch(/2026-10-09/);
  });

  it("returns nothing when no guide is listed", async () => {
    const out = await allroadsGuide.fetch({ fetchImpl: stubFetch([]).impl });
    expect(out.records).toEqual([]);
    expect(out.notices ?? []).toEqual([]);
  });
});
