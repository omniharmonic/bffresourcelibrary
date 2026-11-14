import type { Connector, FeedRecord } from "../types";
import { formatAddress, queryArcGISLayer, stableKey, str } from "./arcgis";

/**
 * City of Boulder "ConnectBoulder WiFi Coverage" (CC0). The catalog URL
 * (maps.bouldercolorado.gov/.../IT/WifiBoundary) returns 404; this working
 * layer was verified 2026-11-14. Polygons (one per coverage area), fields:
 * FACILITY, ADDRESS (street only, no city/zip), PUBLICWAPS, WIFIGROUP.
 * Several polygons share a facility (e.g. Boulder Reservoir ×7), so rows are
 * merged per facility+address and located at the largest polygon's centroid.
 * The data says nothing about outlets, so `device-charging` is not assigned.
 */
export const LAYER_URL = "https://gis.bouldercolorado.gov/ags_svr1/rest/services/IT/ConnectBoulderWifi/MapServer/0";

/** Facilities people can simply walk into or hang out at (vs. offices / maintenance yards). */
const PUBLIC_SPACE_RE = /library|rec(reation)? center|community center|age well|civic area|nature center|reservoir|pool|\bpark$/i;

export const cityWifi: Connector = {
  id: "city-wifi",
  label: "City of Boulder public Wi-Fi (ConnectBoulder)",
  sourceUrl: "https://open-data.bouldercolorado.gov/datasets/48df2efe142f44bbb6c67c13d8a2eb07_0",
  async fetch(opts) {
    const features = await queryArcGISLayer(LAYER_URL, opts);
    const groups = new Map<string, { name: string; street?: string; waps: number; lat?: number; lng?: number }>();
    for (const { attributes: a, lat, lng } of features) {
      const name = str(a.FACILITY);
      if (!name) continue;
      const street = str(a.ADDRESS);
      const key = stableKey(name, street);
      const waps = Number(a.PUBLICWAPS) || 0;
      const g = groups.get(key);
      if (!g) groups.set(key, { name, street, waps, lat, lng });
      else {
        g.waps += waps;
        if (g.lat === undefined && lat !== undefined) Object.assign(g, { lat, lng });
      }
    }

    const records: FeedRecord[] = [];
    for (const [key, g] of groups) {
      if (g.waps <= 0) continue;
      const outdoor = /civic area/i.test(g.name);
      const categories = ["technology-access"];
      if (PUBLIC_SPACE_RE.test(g.name)) categories.push("free-and-friendly-public-spaces");
      records.push({
        externalId: key,
        fields: {
          name: g.name,
          organization: "City of Boulder",
          summary: outdoor
            ? "Free outdoor public Wi-Fi (ConnectBoulder) in the Civic Area."
            : "City building with free public Wi-Fi (ConnectBoulder).",
          address: g.street ? formatAddress({ street: g.street, city: "Boulder", state: "CO" }) : undefined,
          ...(g.lat !== undefined && g.lng !== undefined ? { lat: g.lat, lng: g.lng } : {}),
        },
        categories,
      });
    }
    return { records };
  },
};

export default cityWifi;
