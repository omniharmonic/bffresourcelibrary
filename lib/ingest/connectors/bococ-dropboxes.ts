import type { Connector, FeedRecord } from "../types";
import { formatAddress, formatPhone, formatUrl, queryArcGISLayer, stableKey, str, yes } from "./arcgis";

/**
 * Boulder County "Prescription Drop Boxes" (CC BY 4.0). Fields verified 2026-11-14:
 * Name, Address, Phone, Notes, URL, SolidMed, LiquidMed, Syringe (Y/N, sometimes Yes/No).
 * Only syringe/sharps disposal sites are ingested; medication-only boxes are skipped.
 * The layer appears to be reloaded nightly (created_date changes), so OBJECTID/GlobalID
 * are not used as the external id.
 */
export const LAYER_URL = "https://maps.bouldercounty.org/arcgis/rest/services/HEALTH/PrescriptionDropOffExchange/MapServer/0";

const HOURS_RE = /\b\d{1,2}(:\d{2})?\s*(am|pm)\b|\bM\s*-\s*F\b|\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*\b|7 days/i;

export const bococDropboxes: Connector = {
  id: "bococ-dropboxes",
  label: "Boulder County syringe disposal drop boxes",
  sourceUrl: "https://opendata-bouldercounty.hub.arcgis.com/datasets/bouldercounty::prescription-drop-boxes",
  async fetch(opts) {
    const features = await queryArcGISLayer(LAYER_URL, opts);
    const records: FeedRecord[] = [];
    for (const { attributes: a, lat, lng } of features) {
      if (!yes(a.Syringe)) continue;
      const name = str(a.Name);
      if (!name) continue;
      const notes = str(a.Notes);
      const worksOnly = !!notes && /works/i.test(notes);
      const address = formatAddress({ street: str(a.Address) });
      records.push({
        externalId: stableKey(name, address),
        fields: {
          name,
          summary: worksOnly
            ? "Syringe and sharps drop-off for Works Program participants."
            : "Drop-off site for used syringes and sharps.",
          phone: formatPhone(a.Phone),
          url: formatUrl(a.URL),
          address,
          ...(lat !== undefined && lng !== undefined ? { lat, lng } : {}),
          ...(notes && HOURS_RE.test(notes) ? { hoursText: notes } : {}),
          ...(worksOnly ? { eligibility: notes } : notes && !HOURS_RE.test(notes) ? { access: notes } : {}),
        },
        categories: ["harm-reduction", "trash-bags-and-disposal"],
      });
    }
    return { records };
  },
};

export default bococDropboxes;
