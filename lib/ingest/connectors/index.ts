import type { Connector } from "../types";
import { allroadsGuide } from "./allroads-guide";
import { bococDropboxes } from "./bococ-dropboxes";
import { bococNaloxone } from "./bococ-naloxone";
import { cityWifi } from "./city-wifi";
import { findTreatment } from "./findtreatment";

/** All v1 connectors. Never add the SAMPS / encampment layers here (see research memo 02 §1.4). */
export const connectors: Connector[] = [bococDropboxes, bococNaloxone, cityWifi, findTreatment, allroadsGuide];

export { allroadsGuide, bococDropboxes, bococNaloxone, cityWifi, findTreatment };
