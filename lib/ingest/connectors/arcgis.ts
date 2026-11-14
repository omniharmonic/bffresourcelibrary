/**
 * Small reusable helpers for ArcGIS REST layers (FeatureServer / MapServer),
 * plus a few normalization helpers shared by the v1 connectors.
 */
import { slugify } from "../../slug";

export type ArcGISAttributes = Record<string, unknown>;

export type ArcGISFeature = {
  attributes: ArcGISAttributes;
  /** WGS84 point (polygon/polyline geometries are reduced to a centroid). */
  lat?: number;
  lng?: number;
};

type RawGeometry = {
  x?: number;
  y?: number;
  rings?: number[][][];
  paths?: number[][][];
  points?: number[][];
};

type QueryResponse = {
  features?: { attributes?: ArcGISAttributes; geometry?: RawGeometry | null }[];
  exceededTransferLimit?: boolean;
  error?: { code?: number; message?: string; details?: string[] };
};

export const REQUEST_TIMEOUT_MS = 20_000;
const MAX_PAGES = 50;

/**
 * Query every feature of an ArcGIS layer:
 * `where=1=1&outFields=*&outSR=4326&f=json`, paging with `resultOffset` while
 * the server reports `exceededTransferLimit` (i.e. it capped the page at its
 * maxRecordCount).
 */
export async function queryArcGISLayer(
  layerUrl: string,
  opts: { fetchImpl?: typeof fetch; where?: string; outFields?: string } = {},
): Promise<ArcGISFeature[]> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const base = layerUrl.replace(/\/+$/, "") + "/query";
  const out: ArcGISFeature[] = [];
  let offset = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({
      where: opts.where ?? "1=1",
      outFields: opts.outFields ?? "*",
      outSR: "4326",
      returnGeometry: "true",
      f: "json",
    });
    // Older MapServers reject resultOffset unless paging is needed, so only send it after page 1.
    if (offset > 0) {
      params.set("resultOffset", String(offset));
      params.set("orderByFields", "OBJECTID");
    }
    const res = await fetchImpl(`${base}?${params}`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { accept: "application/json" },
    });
    if (!res.ok) throw new Error(`ArcGIS ${layerUrl}: HTTP ${res.status}`);
    const body = (await res.json()) as QueryResponse;
    // ArcGIS reports most errors as HTTP 200 with an `error` object.
    if (body.error) {
      throw new Error(`ArcGIS ${layerUrl}: ${body.error.code ?? ""} ${body.error.message ?? "error"}`.trim());
    }
    const feats = body.features ?? [];
    for (const f of feats) {
      const pt = toLngLat(f.geometry ?? null);
      out.push({ attributes: f.attributes ?? {}, ...(pt ? { lng: pt[0], lat: pt[1] } : {}) });
    }
    if (!body.exceededTransferLimit || feats.length === 0) break;
    offset += feats.length;
  }
  return out;
}

/** Point → [lng, lat]; polygon → area-weighted centroid of the largest ring; line/multipoint → vertex mean. */
export function toLngLat(g: RawGeometry | null): [number, number] | null {
  if (!g) return null;
  if (isNum(g.x) && isNum(g.y)) return [g.x, g.y];
  if (g.rings?.length) {
    let best: [number, number] | null = null;
    let bestArea = -1;
    for (const ring of g.rings) {
      const c = ringCentroid(ring);
      if (c && c.area > bestArea) {
        bestArea = c.area;
        best = [c.x, c.y];
      }
    }
    if (best) return best;
  }
  const pts = g.paths?.flat() ?? g.points ?? g.rings?.flat() ?? [];
  if (pts.length) {
    const sx = pts.reduce((s, p) => s + p[0], 0);
    const sy = pts.reduce((s, p) => s + p[1], 0);
    return [sx / pts.length, sy / pts.length];
  }
  return null;
}

function ringCentroid(ring: number[][]): { x: number; y: number; area: number } | null {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[(i + 1) % n];
    const cross = x0 * y1 - x1 * y0;
    a += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  if (a === 0) return null;
  return { x: cx / (3 * a), y: cy / (3 * a), area: Math.abs(a / 2) };
}

function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/* ---------- normalization helpers shared by connectors ---------- */

/** Trimmed string with collapsed whitespace, or undefined for null/blank. */
export function str(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  const s = String(v).replace(/\s+/g, " ").trim();
  return s ? s : undefined;
}

/**
 * Single-line address "street, city, CO zip" from parts. If only `street` is
 * given and it already contains a city/state, it is cleaned and returned as is.
 */
export function formatAddress(parts: { street?: string; street2?: string; city?: string; state?: string; zip?: string }): string | undefined {
  const street = [str(parts.street), str(parts.street2)].filter(Boolean).join(" ");
  const city = str(parts.city);
  const state = str(parts.state) ?? (city ? "CO" : undefined);
  const zip = str(parts.zip);
  const tail = [state, zip].filter(Boolean).join(" ");
  const line = [street, city, tail].filter(Boolean).join(", ");
  return line ? line.replace(/\s*,\s*(,\s*)+/g, ", ").replace(/\s+,/g, ",") : undefined;
}

/**
 * Normalize a US phone to "303-555-1234" (keeping any extension). Returns
 * undefined for numbers with fewer than 10 digits — some county rows are
 * truncated, and a wrong number is worse than none.
 */
export function formatPhone(v: unknown): string | undefined {
  const s = str(v);
  if (!s) return undefined;
  const m = s.match(/^(.*?)(\s*(?:x|ext\.?|extension)\s*\d+)?$/i);
  const main = m?.[1] ?? s;
  const ext = m?.[2] ? ` x${m[2].replace(/\D/g, "")}` : "";
  let d = main.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  if (d.length !== 10) return undefined;
  return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}${ext}`;
}

/** Normalize a website value; adds https:// to bare hosts. */
export function formatUrl(v: unknown): string | undefined {
  const s = str(v);
  if (!s) return undefined;
  if (/^https?:\/\//i.test(s)) return s;
  if (/^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(s)) return `https://${s}`;
  return undefined;
}

/** Stable id from human-meaningful parts (names + addresses survive nightly reloads; OBJECTIDs may not). */
export function stableKey(...parts: (string | undefined)[]): string {
  return slugify(parts.filter(Boolean).join(" ")).slice(0, 120);
}

/** Y / Yes / TRUE / 1 → true. */
export function yes(v: unknown): boolean {
  return /^(y|yes|true|1)$/i.test(String(v ?? "").trim());
}
