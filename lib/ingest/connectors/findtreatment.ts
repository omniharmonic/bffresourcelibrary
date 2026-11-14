import type { Connector, FeedRecord } from "../types";
import { formatAddress, formatPhone, formatUrl, REQUEST_TIMEOUT_MS, stableKey, str } from "./arcgis";

/**
 * SAMHSA FindTreatment.gov locator, facilities within 10 miles of downtown Boulder.
 * Verified 2026-11-14: `sAddr` must be "lat,lng" (a free-text address returns
 * "Invalid request"); `limitValue` is in meters. Response: { page, totalPages,
 * recordCount, rows[] } with name1, name2, street1, street2, city, state, zip,
 * phone, website, latitude, longitude (strings), typeFacility (SA | MH | OTP …),
 * services[] { f1 label, f2 code, f3 "; "-joined values } (services may be null).
 * The v2 export has no `frid`, and one facility appears once per typeFacility
 * (SA + MH), so rows are merged on name + street + zip.
 */
export const API_URL = "https://findtreatment.gov/locator/exportsAsJson/v2";
const CENTER = { lat: 40.015, lng: -105.27 };
const RADIUS_M = 16093; // 10 miles
const PAGE_SIZE = 100;
const MAX_PAGES = 10;

type Row = {
  name1?: string | null;
  name2?: string | null;
  street1?: string | null;
  street2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  phone?: string | null;
  intake1?: string | null;
  website?: string | null;
  latitude?: string | number | null;
  longitude?: string | number | null;
  typeFacility?: string | null;
  services?: { f1?: string; f2?: string; f3?: string }[] | null;
};
type Resp = { page?: number; totalPages?: number; recordCount?: number; rows?: Row[] };

const MAT_RE = /buprenorphine|methadone|naltrexone|opioid treatment program/i;

export function categorize(rows: Row[]): string[] {
  const cats = new Set<string>();
  for (const r of rows) {
    const t = (r.typeFacility ?? "").toUpperCase();
    const svc = new Map((r.services ?? []).map((s) => [s.f2 ?? "", s.f3 ?? ""]));
    const tc = svc.get("TC") ?? "";
    if (t === "SA" || t === "OTP" || /substance use|detox/i.test(tc) || svc.has("DETOX")) cats.add("sud-treatment");
    // OTP = Opioid Treatment Program; OM = "Opioid Medications used in Treatment"; PHR = pharmacotherapies.
    if (t === "OTP" || svc.has("OM") || MAT_RE.test(svc.get("PHR") ?? "") || MAT_RE.test(svc.get("OM") ?? "")) {
      cats.add("medication-assisted-treatment-mat");
      cats.add("sud-treatment");
    }
    if (t === "MH" || /mental health/i.test(tc)) cats.add("mental-and-behavioral-health-care");
  }
  const order = ["sud-treatment", "medication-assisted-treatment-mat", "mental-and-behavioral-health-care"];
  return order.filter((c) => cats.has(c));
}

function summarize(cats: string[]): string {
  const sud = cats.includes("sud-treatment");
  const mh = cats.includes("mental-and-behavioral-health-care");
  const mat = cats.includes("medication-assisted-treatment-mat");
  const what = sud && mh ? "substance use and mental health treatment" : sud ? "substance use treatment" : "mental health treatment";
  return `Licensed provider offering ${what}${mat ? ", including medications for opioid use disorder" : ""}.`;
}

function firstStr(rows: Row[], k: keyof Row): string | undefined {
  for (const r of rows) {
    const v = str(r[k]);
    if (v) return v;
  }
  return undefined;
}

/** Union of a service code's "; "-separated values across merged rows, in a stable order (API row order varies between calls). */
function serviceValue(rows: Row[], code: string): string | undefined {
  const parts = new Set<string>();
  for (const r of rows) for (const s of r.services ?? []) if (s.f2 === code && str(s.f3)) for (const p of str(s.f3)!.split(";")) if (p.trim()) parts.add(p.trim());
  return parts.size ? [...parts].sort().join("; ") : undefined;
}

export const findTreatment: Connector = {
  id: "findtreatment",
  label: "SAMHSA FindTreatment.gov (10 mi of Boulder)",
  sourceUrl: "https://findtreatment.gov/",
  async fetch(opts) {
    const fetchImpl = opts?.fetchImpl ?? fetch;
    const rows: Row[] = [];
    let totalPages = 1;
    for (let page = 1; page <= Math.min(totalPages, MAX_PAGES); page++) {
      const params = new URLSearchParams({
        sAddr: `${CENTER.lat},${CENTER.lng}`,
        limitType: "2",
        limitValue: String(RADIUS_M),
        pageSize: String(PAGE_SIZE),
        page: String(page),
        sort: "0",
      });
      const res = await fetchImpl(`${API_URL}?${params}`, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: { accept: "application/json" },
      });
      if (!res.ok) throw new Error(`FindTreatment: HTTP ${res.status}`);
      const body = (await res.json()) as Resp;
      if (!Array.isArray(body.rows)) throw new Error("FindTreatment: unexpected response (no rows)");
      rows.push(...body.rows);
      totalPages = body.totalPages ?? 1;
    }

    const groups = new Map<string, Row[]>();
    for (const r of rows) {
      const name = [str(r.name1), str(r.name2)].filter(Boolean).join(" - ");
      if (!name) continue;
      const key = stableKey(name, str(r.street1), str(r.zip));
      groups.set(key, [...(groups.get(key) ?? []), r]);
    }

    const records: FeedRecord[] = [];
    for (const [key, unsorted] of groups) {
      const rs = [...unsorted].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
      const r0 = rs[0];
      const name1 = str(r0.name1);
      const name2 = str(r0.name2);
      const categories = categorize(rs);
      if (!categories.length) continue;
      const lat = Number(firstStr(rs, "latitude"));
      const lng = Number(firstStr(rs, "longitude"));
      const pay = serviceValue(rs, "PAY");
      const assist = serviceValue(rs, "PYAS");
      const ages = serviceValue(rs, "AGE");
      records.push({
        externalId: key,
        fields: {
          name: name1 && name2 ? `${name1} - ${name2}` : (name1 ?? name2)!,
          organization: name1 && name2 ? name1 : undefined,
          summary: summarize(categories),
          phone: formatPhone(firstStr(rs, "intake1")) ?? formatPhone(firstStr(rs, "phone")),
          url: formatUrl(firstStr(rs, "website")),
          address: formatAddress({ street: str(r0.street1), street2: str(r0.street2), city: str(r0.city), state: str(r0.state), zip: str(r0.zip) }),
          ...(Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 ? { lat, lng } : {}),
          ...(pay || assist ? { access: [pay && `Payment accepted: ${pay}.`, assist && `Help paying: ${assist}.`].filter(Boolean).join(" ") } : {}),
          ...(ages ? { eligibility: `Ages: ${ages}.` } : {}),
        },
        categories,
      });
    }
    return { records };
  },
};

export default findTreatment;
