import type { Connector, FeedRecord } from "../types";
import { formatAddress, formatPhone, queryArcGISLayer, stableKey, str } from "./arcgis";

/**
 * Boulder County "Pharmacies Providing Naloxone (NARCAN)" (CC BY 4.0).
 * Fields verified 2026-11-14: Name, Address (one line), Phone, Notes
 * (e.g. "Call ahead to ensure availability; nasal"). No hours field.
 */
export const LAYER_URL = "https://maps.bouldercounty.org/arcgis/rest/services/HEALTH/NarcanPharmacies/MapServer/0";

export const bococNaloxone: Connector = {
  id: "bococ-naloxone",
  label: "Boulder County pharmacies providing naloxone",
  sourceUrl: "https://opendata-bouldercounty.hub.arcgis.com/datasets/bouldercounty::pharmacies-providing-naloxone-narcan",
  async fetch(opts) {
    const features = await queryArcGISLayer(LAYER_URL, opts);
    const records: FeedRecord[] = [];
    for (const { attributes: a, lat, lng } of features) {
      const name = str(a.Name);
      if (!name) continue;
      const address = formatAddress({ street: str(a.Address) });
      const notes = str(a.Notes);
      records.push({
        externalId: stableKey(name, address),
        fields: {
          name,
          summary: "Pharmacy that carries naloxone (Narcan). Ask at the pharmacy counter.",
          phone: formatPhone(a.Phone),
          address,
          ...(lat !== undefined && lng !== undefined ? { lat, lng } : {}),
          ...(notes ? { access: notes } : {}),
        },
        categories: ["harm-reduction"],
      });
    }
    return { records };
  },
};

export default bococNaloxone;
