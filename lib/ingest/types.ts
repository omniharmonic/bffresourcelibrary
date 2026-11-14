/**
 * Contract for data-source connectors. A connector only FETCHES and NORMALIZES;
 * the runner (lib/ingest/runner.ts) decides what to apply vs. send to review.
 */
export type FeedFields = Partial<{
  name: string;
  organization: string;
  summary: string;
  access: string;
  phone: string;
  url: string;
  email: string;
  address: string;
  lat: number;
  lng: number;
  hoursText: string;
  eligibility: string;
}>;

export type FeedRecord = {
  /** Stable id within this source (e.g. ArcGIS OBJECTID/GlobalID, FindTreatment frid). */
  externalId: string;
  fields: FeedFields & { name: string };
  /** Category slugs from data/seed/categories.json */
  categories: string[];
};

/** A notice is not a record; it opens a review item (e.g. "new street sheet PDF published"). */
export type FeedNotice = { key: string; summary: string; url?: string };

export interface Connector {
  /** Short stable id, used as `feed:<id>` provenance. */
  id: string;
  label: string;
  /** Public docs/source URL for attribution. */
  sourceUrl: string;
  fetch(opts?: { fetchImpl?: typeof fetch }): Promise<{ records: FeedRecord[]; notices?: FeedNotice[] }>;
}
