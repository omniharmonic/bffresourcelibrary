import type { Connector, FeedNotice } from "../types";
import { REQUEST_TIMEOUT_MS, str } from "./arcgis";

/**
 * Watcher for All Roads' Community Resource Guide ("street sheet") PDFs.
 * All Roads runs WordPress; the media API lists each upload with a timestamp.
 * Verified 2026-11-14: `search=resource guide` + `mime_type=application/pdf`
 * returns 17 items, newest "August 2026 Resource Guide ENG/SP" (ids 987499098/9,
 * uploaded 2026-10-09). Titles vary ("July 2024 Community Resource Guide pdf",
 * "2024 Julio Spanish Resource Guide"), so we match /resource guide/ loosely.
 *
 * Returns no records, only a notice per file of the newest edition (the ENG and
 * SP uploads usually land within seconds of each other). The runner dedupes by key.
 */
export const MEDIA_URL = "https://allroadsboco.org/wp-json/wp/v2/media";
const SAME_EDITION_WINDOW_MS = 2 * 24 * 3600 * 1000;

type Media = {
  id: number;
  date_gmt?: string;
  date?: string;
  slug?: string;
  title?: { rendered?: string };
  mime_type?: string;
  source_url?: string;
};

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/<[^>]+>/g, "");
}

function uploadedAt(m: Media): number {
  const d = m.date_gmt ? `${m.date_gmt}Z` : m.date;
  const t = d ? Date.parse(d) : NaN;
  return Number.isFinite(t) ? t : 0;
}

export const allroadsGuide: Connector = {
  id: "allroads-guide",
  label: "All Roads Community Resource Guide (new edition watcher)",
  sourceUrl: "https://allroadsboco.org/get-help/",
  async fetch(opts) {
    const fetchImpl = opts?.fetchImpl ?? fetch;
    const params = new URLSearchParams({
      search: "resource guide",
      mime_type: "application/pdf",
      orderby: "date",
      order: "desc",
      per_page: "20",
      _fields: "id,date,date_gmt,slug,title,mime_type,source_url",
    });
    const res = await fetchImpl(`${MEDIA_URL}?${params}`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { accept: "application/json" },
    });
    if (!res.ok) throw new Error(`All Roads media API: HTTP ${res.status}`);
    const body = (await res.json()) as unknown;
    if (!Array.isArray(body)) throw new Error("All Roads media API: unexpected response");

    const guides = (body as Media[])
      .filter((m) => m && typeof m.id === "number" && m.source_url)
      .filter((m) => !m.mime_type || m.mime_type === "application/pdf")
      .filter((m) => /resource[\s_-]*guide/i.test(`${m.title?.rendered ?? ""} ${m.slug ?? ""} ${m.source_url}`))
      .sort((a, b) => uploadedAt(b) - uploadedAt(a));
    if (!guides.length) return { records: [] };

    const newest = uploadedAt(guides[0]);
    const edition = guides.filter((m) => newest - uploadedAt(m) <= SAME_EDITION_WINDOW_MS);
    const notices: FeedNotice[] = edition.map((m) => {
      const title = str(decodeEntities(m.title?.rendered ?? "")) ?? m.slug ?? String(m.id);
      const day = new Date(uploadedAt(m)).toISOString().slice(0, 10);
      return {
        key: `allroads-media:${m.id}`,
        summary: `New All Roads street sheet published: "${title}" (uploaded ${day}). Check it against our records.`,
        url: m.source_url,
      };
    });
    return { records: [], notices };
  },
};

export default allroadsGuide;
