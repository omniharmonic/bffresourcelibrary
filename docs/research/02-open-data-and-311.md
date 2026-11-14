# 02 — Open Data & 311 (City of Boulder, Boulder County, Colorado, federal, Denver reference)

*Research memo for the Boulder Feet Forward (BFF) resource app. Prepared 2026-11-14.*
*Scope: City of Boulder open data and 311 (Inquire Boulder), Boulder County and regional open data, Colorado state and federal facility datasets, and Denver 311 as a reference taxonomy.*
*Method: every endpoint below was called with `curl` from this session on 2026-11-14 unless it is marked **UNVERIFIED**. Record counts and "last edit" dates are what the live services returned that day.*

---

## 1. Summary and recommendation

**Bottom line:** open data can give BFF a reliable, automatically refreshed **map layer of places**: restrooms, parks with shelters, Wi-Fi, transit stops, libraries, syringe disposal, naloxone, health centers, treatment providers, and SNAP retailers. It **cannot** give BFF a directory of **services** (hours, eligibility, intake rules). There is no City of Boulder open dataset of homelessness services, meal schedules, day shelters, or cooling/warming center activations. That layer has to come from 211, provider websites, and BFF's own curation (see memos 01 and 03).

### Recommendations

1. **Ingest these as Tier-1 automated feeds.** Each has a live REST API, a stable schema, and was verified today:
   - City of Boulder **Park Site Points** (103 parks, with `RESTROOM` = Year Round / 3 Season / Summer / None and a `SHELTER` count). Data last edited 2026-06-17.
   - City **Transit Stops** (1,349 stops, with `SHELTER`, `BENCHES`, `LIGHTING`, `TRASHCANQTY`). Edited 2026-11-05.
   - **RTD GTFS** static feed plus GTFS-Realtime (Alerts, TripUpdates, VehiclePositions). Current feed valid 2026-09-27 to 2027-01-02.
   - **ConnectBoulder public Wi-Fi** footprints (49 city buildings, with a count of access points per building).
   - **Boulder County "Prescription Drop Boxes"**: 18 sites, including 6 syringe-disposal sites, with Y/N flags for solid meds, liquid meds, and syringes.
   - **Boulder County "Pharmacies Providing Naloxone"** (36 sites).
   - **Boulder County Libraries** (20).
   - **HRSA health center sites** (7 sites in Boulder, including the clinic at Boulder Shelter for the Homeless).
   - **SAMHSA FindTreatment.gov** locator API (21 providers within 10 miles of downtown).
   - **CDHS LADDERS** behavioral-health directory (17 sites in Boulder, with hours fields).
   - **USDA SNAP retailers** (46 in the city of Boulder).
   - **CDPHE licensed health facilities** (182 in Boulder County).
2. **Treat these as one-time seeds, not live feeds.** Import once, then let humans maintain them:
   - The retired **"Restroom and Water Fountain Status"** layer: 49 restrooms and 18 water fountains with point locations, last edited July 2021. It is still the only city layer that has drinking fountains.
   - Boulder County's **"Food Resources"** (50 pantries and meal programs) and **"Shelters for Unhoused"** (6), both last edited 2023-09-27.
   - The broader **City "COVID-19 Status"** amenity layer (364 city amenities with type, including rec centers and library services).
3. **Do not build the needs taxonomy from Boulder's 311.**
   - The only public **Inquire Boulder** dataset is frozen (2013-07-11 to 2019-12-31, last edited 2020-08-27).
   - It has **no location field**, and its 145 topics are about city maintenance (parking meters, potholes, graffiti).
   - Its human-services topics are tiny: "Contact Human Services" has 61 + 26 requests, and "Report Syringes" has 2.
   - Use it only as context. For a reference model of how a large 311 system organizes human needs, use **Denver 311** (§4).
4. **Handle the encampment ("SAMPS") layers with great care.**
   - The city publishes **live** encampment inspection, notice, and clean-up points, refreshed daily (latest records 2026-11-13). It also publishes a **live public layer of Inquire Boulder "Report Unsanctioned Camping" requests** (5,145 rows).
   - That layer has free-text `NOTE` (5,145 non-empty), `LOCDESC`, and **requester address (`REQRADDR`, 3,151 non-empty)**. Those fields look like personal data and may be published by mistake.
   - **Never ingest these into anything public-facing, and never use them to locate people.** One possible protective use: staff-only, aggregated "posted notice in the last N days" signals near a client's area. With those signals, outreach workers can warn people to move belongings, and can use the `PROPSTORED` field to tell them their property was stored.
   - BFF leadership should decide this explicitly (Open questions §6). BFF may also want to tell the city about the PII exposure.
5. **Ingestion pattern for everything ArcGIS:**
   - Poll the layer's `?f=json` metadata for `editingInfo.dataLastEditDate`. Hosted layers have it. Enterprise MapServer layers on `gis.bouldercolorado.gov` and `maps.bouldercounty.org` do not.
   - For layers without it, fall back to `MAX(last_edited_date)` via `outStatistics`, or a content hash.
   - Page with `resultOffset`/`resultRecordCount` up to `maxRecordCount` (1,000 or 2,000). Request `f=geojson&outSR=4326`.
   - Upsert as **field assertions** keyed on `(source_id, source_record_id)`, per memo 04.

---

## 2. Dataset inventory

Legend for **Use**:
- **A** = automate (live feed)
- **S** = one-time seed, then human-maintained
- **C** = context or analytics only
- **X** = do not ingest

"Edited" is the last-edit date returned by the service on 2026-11-14. Hosted layers report it in `editingInfo.dataLastEditDate`; for the others it is `MAX(last_edited_date)` or the catalog's `modified` date, as noted.

### 2.1 City of Boulder — catalog facts

- **Portal:** https://open-data.bouldercolorado.gov/ (ArcGIS Hub; organization id `ePKBjXrBZ2vEEgWd`, services on `services.arcgis.com/ePKBjXrBZ2vEEgWd`). Older layers are on an ArcGIS Enterprise server at `gis.bouldercolorado.gov/ags_svr{1,2,3}`.
- **Catalog size:** the DCAT feed `https://open-data.bouldercolorado.gov/api/feed/dcat-us/1.1.json` returned **190 datasets**. The OGC Records API `https://open-data.bouldercolorado.gov/api/search/v1/collections/dataset/items` returned `numberMatched` = 161 for the "dataset" collection.
- **License:** most items are **CC0-1.0** (`https://creativecommons.org/publicdomain/zero/1.0`, as stated in the DCAT `license`). Some items point to the terms at https://bouldercolorado.gov/services/open-data.
- **311 tag:** `…/search?collection=dataset&tags=311` resolves to exactly two items:
  - *Inquire Boulder Customer Service Portal Requests by Topic*
  - *2017 Human Services Strategy Survey*

  (OGC search `q=311`, verified.)
- **Not in the catalog:**
  - public restrooms (current)
  - drinking fountains (current)
  - city facilities with hours
  - rec-center amenities (showers, charging)
  - cooling/warming centers
  - homelessness service locations
  - food programs
  - needle disposal
  - an RTD GTFS mirror

  Several of these exist as **unlisted** layers, found via the ArcGIS Online search API with `orgid:ePKBjXrBZ2vEEgWd`. They are listed below.

### 2.2 Inventory table — City of Boulder

| Need | Dataset | API endpoint (verified) | Format(s) | Key fields | Records / Edited | License | Use |
|---|---|---|---|---|---|---|---|
| Restrooms, picnic shelters | **Park Site Points** ([page](https://open-data.bouldercolorado.gov/datasets/Boulder::properties-managed-by-parks-and-recreation-points)) | `https://gis.bouldercolorado.gov/ags_svr2/rest/services/parks/ParkSitesOpenData/MapServer/0` | MapServer query → JSON/GeoJSON; Hub CSV `…/api/download/v1/items/386970ac9fe641b880e4f42a22111f4e/csv?layers=0` | `NAME, ADDRESS, PARKTYPE, RESTROOM` (Year Round 20 / 3 Season 4 / Summer 3 / None 76), `SHELTER` (count), `DOGPARK, WATERACCESS, PHOTOURL, LAST_EDITED_DATE` | 103 / max `LAST_EDITED_DATE` 2026-06-17 | CC0 | **A** |
| Park polygons | Properties Managed by Parks & Rec — Polygons | `…/parks/ParkSitesOpenData/MapServer/1` | same | polygons for "nearest park" | catalog modified 2023-11-11 | CC0 | A (optional) |
| Restrooms + **drinking fountains** | *Restroom and Water Fountain COVID-19 Status* (web map "Restroom Facilities Map (Retired)", item `7258290db33c483c99d8343ff606548d`) — **not in Hub catalog** | `https://gis.bouldercolorado.gov/ags_svr2/rest/services/parks/StatusCOVID19/MapServer/3` | MapServer JSON | `AMENITYNAME, AMENITYTYPE` (Public Restroom 49 / Water Fountain 18), `STATUS, NOTES, last_edited_date` | 67 / last edit 2021-07-27 (stale) | not stated (org default CC0 — **UNVERIFIED**) | **S** (geometry seed; ignore status) |
| City amenities (rec centers, library service points, service desks, trailheads) | *City of Boulder COVID-19 Status* — **not in Hub catalog** | `…/parks/StatusCOVID19/MapServer/1` (all 364); `/5` = Library (17) | MapServer JSON | `AMENITYNAME, AMENITYTYPE` (Recreation Center 39, Library Service or Amenity 10, Service Desk 13, Community Gathering Center 11, …), `ADDRESS, WEBLINK` | 364 / 2020–21 (stale) | **UNVERIFIED** | **S** |
| Benches, picnic tables, grills | Outdoor Furniture (Parks) — **not in Hub catalog** | `https://gis.bouldercolorado.gov/ags_svr2/rest/services/parks/OutdoorFurniturePublic/MapServer/0` | MapServer JSON | `CATEGORY` (Bench 632, Table 319, Grill 12…), `TYPE, PROPNAME, CONDITION, LAST_EDITED_DATE`. **Contains `DONORPHONE`/`DONOREMAIL` — exclude.** | 1,140 / max edit 2026-07-10 | **UNVERIFIED** | C (maybe A for "places to rest") |
| Public Wi-Fi | **ConnectBoulder WiFi Coverage** ([page](https://open-data.bouldercolorado.gov/datasets/48df2efe142f44bbb6c67c13d8a2eb07_0)) | Catalog URL `maps.bouldercolorado.gov/arcgis/rest/services/IT/WifiBoundary/MapServer/0` **returns 404**. Working: `https://gis.bouldercolorado.gov/ags_svr1/rest/services/IT/ConnectBoulderWifi/MapServer/0` | MapServer JSON (polygons) | `FACILITY, ADDRESS, PUBLICWAPS, WIFIGROUP` | 49 / catalog modified 2020-09-01 | CC0 | **A** (use centroid) |
| Transit stops + amenities | Transit Stops (city asset layer; in web map "Transit Stops and Routes") | `https://gis.bouldercolorado.gov/ags_svr3/rest/services/trans/TransitStop/MapServer/0` | MapServer JSON | `BSID` (= RTD stop id), `STOPNAME, ROUTES, SHELTER, BENCHES, LIGHTING, TRASHCANQTY, STOPURL, RTDBOARDING` | 1,349 / max `LAST_EDITED_DATE` 2026-11-05 | **UNVERIFIED** | **A** (join to GTFS on `BSID`=`stop_code` — **UNVERIFIED join key**) |
| Bus stops (old) | ECOPASS_BusStops | `https://services.arcgis.com/ePKBjXrBZ2vEEgWd/arcgis/rest/services/BusStops/FeatureServer/0` | FeatureServer | `BSID, STOPNAME, ROUTES` | 1,325 / 2016-10-14 | — | X (superseded) |
| Transit routes | Transit Route | `https://gis.bouldercolorado.gov/ags_svr3/rest/services/trans/TransitRoute/MapServer` | MapServer | — | not queried | — | X (use GTFS) |
| Family Resource Schools + Age Well centers | FRS and OAS locations map (item `9360b6b0c2ea4e6b867d7bca10d501e2`) | `https://services.arcgis.com/ePKBjXrBZ2vEEgWd/arcgis/rest/services/FRS_and_OAS_locations_map/FeatureServer/0` | FeatureServer | `Location_Name, Street_Address, Phone, Website` | 7 / data 2025-02-12 | **UNVERIFIED** | S |
| Fire stations | Fire Station Locations | `https://services.arcgis.com/ePKBjXrBZ2vEEgWd/arcgis/rest/services/Fire_Station_Locations/FeatureServer/0` | FeatureServer, CSV, GeoJSON | — | catalog modified 2026-07-16 | city terms | C |
| OSMP trailheads, outhouses | OSMP Trailheads; OSMP Facilities/Outhouses | `https://gis.bouldercolorado.gov/ags_svr2/rest/services/osmp/TrailsNEW/MapServer/0`; `…/osmp/Facilities/MapServer/6` (Outhouses, 19 polygons) | MapServer | `Class` (T1–T3) / `LONGNAME, ADDRESS` | 2026-02-19 / — | CC0 | C (camping on OSMP is banned; mostly context) |
| Library events | Library and BLDG 61 Events and Programs | `https://services.arcgis.com/ePKBjXrBZ2vEEgWd/arcgis/rest/services/Library_and_BLDG_61_Events_and_Programs/FeatureServer/0` | table | `Title, Date, StartTime, Library, Categories` | 10,661 / 2023-12-11 (stopped updating) | — | X (use library's own calendar) |
| Homeless-system attendance | Attendance in Boulder Homelessness System Adult Programs | `https://services.arcgis.com/ePKBjXrBZ2vEEgWd/arcgis/rest/services/Nightly_Attendance_in_Boulder_Homelessness_System_Adult_Programs/FeatureServer/0` | table | `Date, Program, Provider, Attendance` | 1,341 / 2020-08-31 | CC0 | C |
| HHS grantees | Human Services Fund; Health Equity Fund; Grants to Community Orgs | `…/Human_Services_Fund_Funding/FeatureServer/0` etc. | table | grantee name, program, amount, year | 2020 (stale) | CC0 | C (list of funded orgs to cross-check) |
| Affordable housing | Permanently Affordable Rental Property Locations; Affordable Housing … Households | `…/Permanently_Affordable_Rental_Property_Locations/FeatureServer/0` | FeatureServer | property, website | 2020-08-31 | CC0 | C |
| Nonprofits / culture venues | NonProfitLocations view; CultureVenues view | `…/NonProfitLocations_view/FeatureServer/0` (132, edited 2026-06-23); `…/CultureVenues_view/FeatureServer/0` (107) | FeatureServer | `Organizati, Address, NTEE__Code` | — | **UNVERIFIED** | C |
| 311 (historic) | **Inquire Boulder Customer Service Portal Requests by Topic** ([page](https://open-data.bouldercolorado.gov/datasets/Boulder::inquire-boulder-customer-service-portal-requests-by-topic)) | `https://services.arcgis.com/ePKBjXrBZ2vEEgWd/arcgis/rest/services/Inquire_Boulder_Customer_Service_Portal_Requests_by_Topic/FeatureServer/0` | FeatureServer, CSV (302 → replica cache), GeoJSON | `Entered_via, Department, Topic, Entered_date` (no location) | 62,265 / 2013-07-11 → 2019-12-31; edited 2020-08-27 | CC0 | C |
| Encampment reports (live 311 slice) | SAMPSReportsPublic / layer 6 "Inquire Boulder" | `https://gis.bouldercolorado.gov/ags_svr1/rest/services/IT/SAMPSReportsPublic/FeatureServer/6` | FeatureServer (Query) | `REQTOPIC` (all "Report Unsanctioned Camping"), `REQSTATUS, ENTERDT, CLOSEDT, LOCDESC, NOTE, REQRADDR`… | 5,145 / latest `ENTERDT` 2026-10-14 | **UNVERIFIED** | **X** (PII; see §1.4) |
| Encampment lifecycle | SAMPSPublic (0 Notification, 1 Inspection, 2 Clean Up); SAMPS Open Data MapServer | `https://gis.bouldercolorado.gov/ags_svr1/rest/services/IT/SAMPSPublic/FeatureServer/{0,1,2}`; `https://maps.bouldercolorado.gov/arcgis/rest/services/IT/SAMPSOpenData/MapServer` | FeatureServer | Inspection: `INSPECTDT, OCCUPIED`, risk scores. Clean-up: `CLEANDT, NUMNEEDLE, PROPSTORED` | 3,781 / 5,733 / 4,880; inspections through 2026-11-13 | **UNVERIFIED** | X / staff-only aggregate (decision needed) |
| Point-in-Time count | City of Boulder Summer 2026 PIT – Final_form | `https://services.arcgis.com/ePKBjXrBZ2vEEgWd/arcgis/rest/services/survey123_9d1097e81a4f464eba9d182b96f75eec_f…` (Survey123) | FeatureServer | not queried | — | — | X (not queried; likely sensitive) |
| Calls for service | BPD Calls For Services | `https://services.arcgis.com/ePKBjXrBZ2vEEgWd/arcgis/rest/services/BPD_Calls_For_Services/FeatureServer/1` | FeatureServer, CSV | not inspected | modified 2026-11-12 | not stated | X |

**Not found in City of Boulder open data** (searched both the Hub catalog and ArcGIS Online `orgid:ePKBjXrBZ2vEEgWd` for restroom, fountain, homeless, encampment, shelter, library, recreation center, food, syringe, cooling, warming):

- cooling/warming center activations
- day-shelter or meal-program locations
- shower/charging locations
- current (non-COVID) restroom status

### 2.3 Boulder County and regional

- **Portal:** https://opendata-bouldercounty.hub.arcgis.com/ (DCAT feed `…/api/feed/dcat-us/1.1.json` → **105 datasets**). The older host names `gis-bouldercounty.opendata.arcgis.com` and `data-bouldercounty.hub.arcgis.com` return 404 for the feed.
- **License:** most items are **CC BY 4.0**.
- **Servers:** the county uses `maps.bouldercounty.org/arcgis/rest/services` (Enterprise) and `services3.arcgis.com/0jWpHMuhmHsukKE3` (ArcGIS Online).

| Need | Dataset | API endpoint (verified) | Key fields | Records / Edited | License | Use |
|---|---|---|---|---|---|---|
| **Needle / syringe disposal**, med drop | Prescription Drop Boxes ([page](https://opendata-bouldercounty.hub.arcgis.com/datasets/bouldercounty::prescription-drop-boxes)) | `https://maps.bouldercounty.org/arcgis/rest/services/HEALTH/PrescriptionDropOffExchange/MapServer/0` | `Name, Address, Phone, Notes, URL, SolidMed, LiquidMed, Syringe` (Y/N) | 18 (6 with `Syringe='Y'`, of which 5 are "Works Program" sites that take syringes from Works clients only) / `last_edited_date` 2026-11-13 (looks like a nightly reload) | CC BY 4.0 | **A** |
| **Naloxone** | Pharmacies Providing Naloxone (NARCAN) | `https://maps.bouldercounty.org/arcgis/rest/services/HEALTH/NarcanPharmacies/MapServer/0` | `Name, Address, Phone, Notes` ("Call ahead…") | 36 / catalog modified 2025-11-10 | CC BY 4.0 | **A** |
| Libraries | Libraries | `https://maps.bouldercounty.org/arcgis/rest/services/Landmarks/LIBRARIES/MapServer/0` | `Name, Address, City, Phone` | 20 | CC BY 4.0 | **A** |
| **Food pantries / meals** | *Food Resources* (not in Hub catalog) | `https://services3.arcgis.com/0jWpHMuhmHsukKE3/arcgis/rest/services/Food_Resources/FeatureServer/0` | `ORG_NAME, SERV_TYPE` (Pantry 23, Meal Program 12, Emergency Food 8, Mobile Pantry 4, Meals & Shelter 2, …), `SERV_AREA, WEBSITE, ADDRESS` | 50 / 2023-09-27 | not stated — **UNVERIFIED** | **S** |
| **Shelters / warming** | *Shelters for Unhoused* (item `a79c50a189f043e0885fd88edbf8ae24`, made "for Transportation Planning") | `https://services3.arcgis.com/0jWpHMuhmHsukKE3/arcgis/rest/services/Shelters_for_Unhoused/FeatureServer/0` | same schema; includes Boulder Shelter for the Homeless, HOPE, Agape, and 2 DV shelters | 6 / 2023-09-27. Data-quality problem: the HOPE website field points to safehousealliance.org | **UNVERIFIED** | S (seed; **never publish DV shelter locations**) |
| Disaster shelters | EOC Shelters – Public VIEW | `https://services3.arcgis.com/0jWpHMuhmHsukKE3/arcgis/rest/services/EOC_Shelters__Public_VIEW/FeatureServer/0` | `FACNAME, FULLADDR, CAPACITY, OPSSTATUS, OPENDATE, CLOSEDDATE, active, ALLOWPETS` | 73 / 2025-12-20 | **UNVERIFIED** | A (watch `OPSSTATUS`/`active` during emergencies) |
| Emergency closures | Emergency Area Closures (Public) view | `https://services3.arcgis.com/0jWpHMuhmHsukKE3/arcgis/rest/services/Emergency_Area_Closures_(Public)_view/FeatureServer/0` | `ClosureStatus, ClosureReason, AreaName, ClosureDate` | 0 today (empty means nothing is closed) / 2026-11-14 | county disclaimer | A (alerts) |
| Youth resources | Youth Resources | `https://services3.arcgis.com/0jWpHMuhmHsukKE3/arcgis/rest/services/Youth_Resources/FeatureServer/0` | `USER_Organization, USER_Programs, USER_Category, USER_Sub_Category, USER_Phone, USER_Website` | 176 / 2022-04-12 | **UNVERIFIED** | S (category list is useful for the taxonomy) |
| County trailheads | BCPOS Trailheads | `https://maps.bouldercounty.org/arcgis/rest/services/ParksOpenSpace/OP_BCPOS_TRAILHEADS/MapServer/0` | — | 2026-05-20 | CC BY 4.0 | C |
| Food-service licenses | Licensed Food Services / Restaurant Inspections | `https://services3.arcgis.com/0jWpHMuhmHsukKE3/arcgis/rest/services/Licensed_Food_Services/FeatureServer/1` (1,445; has owner emails — exclude); Socrata `tuvj-xz3m` (2013–2025) | — | 2023 / 2025-09-08 | Public Domain (Socrata) | X |
| Need indicators | Human Services Index, Eligible but Not Enrolled in SNAP, Below Poverty… | `https://services3.arcgis.com/0jWpHMuhmHsukKE3/arcgis/rest/services/Final_HSI/FeatureServer` etc. | tract-level indices | — | **UNVERIFIED** | C |

### 2.4 Colorado state and federal

| Need | Dataset | API endpoint (verified) | Key fields | Records (Boulder) / Freshness | License | Use |
|---|---|---|---|---|---|---|
| Licensed health facilities | **CDPHE Health Facilities** (data.colorado.gov `whj7-3xqj` → [geodata.colorado.gov](https://geodata.colorado.gov/datasets/CDPHE::cdphe-health-facilities)) | `https://services3.arcgis.com/66aUo8zsujfVXRIT/arcgis/rest/services/CDPHE_Health_Facilities/FeatureServer/0` | `Facility_ID, Facility_Name, Facility_Type, Facility_Type_Detail, Telephone, County, Address_Full, Operating_Status, Date_Data_Updated` | 5,091 statewide; 182 in Boulder County (Hospital 6, Home Care 41, ALR 27, Nursing 11, Other 79) / `dataLastEditDate` 2026-10-16 | not stated on Socrata (**UNVERIFIED**) | A (filter to Hospital, community clinic, ER types) |
| SUD / mental health directory | **CDHS LADDERS** (`fzag-perc` → geodata) | `https://www.cohealthmaps.dphe.state.co.us/arcgis/rest/services/OPEN_DATA/cdphe_cdhs_colorado_ladders/MapServer/0` | `Account_Name, Address, City, Phone, Services_Offered, Substance_Use_Services, Mental_Health_Settings, Population_Served, Fees, Hours_of_Operation_{Monday…Sunday}, Languages_Spoken, Accessibility` | 840 statewide; 17 with City='Boulder' / "Updated January 2026" (Socrata description); `Date_Geocoded` 2026-01-05 | **UNVERIFIED** | **A** (hours fields are often blank) |
| SUD / MH (SAMHSA mirror) | SAMHSA Colorado Substance Abuse & MH Providers | `https://www.cohealthmaps.dphe.state.co.us/arcgis/rest/services/OPEN_DATA/cdphe_samsha_colorado_substance_abuse_mental_health_service_providers/MapServer/0` | MAT flags (`Buprenorphine_*`, `Methadone_*`), `Detoxification, Transitional_Housing` | 506; 14 Boulder / item modified 2019 | — | X (stale; use FindTreatment.gov) |
| SUD / MH treatment (federal) | **FindTreatment.gov locator** | `https://findtreatment.gov/locator/exportsAsJson/v2?sAddr=40.015,-105.27&limitType=2&limitValue=16093&pageSize=100&page=1&sort=0` (`limitValue` in meters) | `name1, street1, city, phone, website, latitude, longitude, services[] {f1 category, f2 code, f3 values}` | 21 within 10 mi (returned `totalPages`, `recordCount`). Passing a free-text address (`sAddr=Boulder, CO`) returned "Invalid request"; **lat,lng works** | US gov public data (**UNVERIFIED** terms) | **A** |
| Community health centers | **HRSA Health Center Service Delivery & Look-Alike Sites** | `https://data.hrsa.gov/DataDownload/DD_Files/Health_Center_Service_Delivery_and_LookAlike_Sites.csv` (14 MB CSV, full refresh) | `Site Name, Site Address, Site City, Site Telephone Number, Site Web Address, Operating Hours per Week, Site Status Description, Health Center Name, Geocoding…X/Y` | 19,616 nationally; 7 in Boulder (all Clinica Family Health, including "Boulder Shelter For The Homeless", 4869 Broadway) | US gov (**UNVERIFIED**) | **A** |
| SNAP retailers | **USDA FNS SNAP Retailer Locations** (AGOL owner `FNS_SNAP_RPMD`, item `8b260f9a10b0459aa441ad8588c2251c`) | `https://services1.arcgis.com/RLQu0rK7h4kbsBq5/arcgis/rest/services/snap_retailer_location_data/FeatureServer/0` | `Record_ID, Store_Name, Store_Street_Address, City, State, Zip_Code, Store_Type, Latitude, Longitude, Incentive_Program` | 248,175 nationally; 46 in Boulder / `dataLastEditDate` 2026-11-04 | US gov (**UNVERIFIED** that this AGOL account is official FNS; the owner name suggests it is) | **A** |
| Child care | CO Licensed Child Care – Boulder County filter (`abkc-n6kt`) | `https://data.colorado.gov/resource/abkc-n6kt.json` (Socrata SODA — **endpoint not called; UNVERIFIED**) | — | updated monthly; data updated 2026-11-02 | ODC-PDDL | C |
| Public housing | HUD Public Housing Developments | `https://services.arcgis.com/VTyQ9soqVukalItT/arcgis/rest/services/Public_Housing_Developments/FeatureServer/0` | `PROJECT_NAME, FORMAL_PARTICIPANT_NAME, TOTAL_UNITS…` | query `STD_CITY='Boulder'` returned 0 (field name or geography may differ; **UNVERIFIED**) / edited 2026-10-24 | US gov | C |
| CoC boundary | HUD CoC Grantee Areas | `https://services.arcgis.com/VTyQ9soqVukalItT/arcgis/rest/services/Continuum_of_Care_Grantee_Areas/FeatureServer/0` | `COCNUM, COCNAME` | Colorado: CO-500, **CO-503 Metro Denver** (which, per memo 01, covers Boulder — **UNVERIFIED** here), CO-504, CO-505 | US gov | C |
| Older CDPHE layers | CDPHE Community Behavioral Health Centers (`7jcr-yuy9`); Drug Treatment Programs (`ic4p-uss4`) | links point to `data-cdphe.opendata.arcgis.com` (2015) | — | 2015 | Public Domain | X (stale) |

### 2.5 Transit — RTD GTFS (verified)

- **Static feed:** `https://www.rtd-denver.com/files/gtfs/google_transit.zip`
  - 200 response, 10.8 MB.
  - `feed_info`: version `Sep26-37381-22-23-20261113-122950`, valid 2026-09-27 → 2027-01-02.
  - 130 routes, including Boulder-area routes `SKIP, JUMP, BOUND, DASH, BOLT, 225/225D/225T, AB1–3, FF1–5, NB1–2, GS, W`.
  - 8,149 stops, 595 of them inside a Boulder bounding box.
  - `stops.txt` has `wheelchair_boarding`.
- **Other static files** are listed on https://www.rtd-denver.com/open-records/open-spatial-information/gtfs: per-mode files, "next runboard" files such as `google_transit_Sep26_Runboard.zip`, and Bustang.
- **GTFS-Realtime:** `https://www.rtd-denver.com/files/gtfs-rt/{TripUpdate,VehiclePosition,Alerts}.pb`. All returned 200 `application/x-protobuf` with `Last-Modified` and `ETag` headers. Alerts can feed service-disruption notes.
- **Change detection:** the static `google_transit.zip` HEAD response did **not** include `Last-Modified`/`ETag` (it returned `text/plain` on HEAD). Download it and compare `feed_info.feed_version` instead.
- **License:** RTD's terms of use are **UNVERIFIED**; check the GTFS page before redistributing.

---

## 3. 311 analysis — Boulder

### 3.1 What exists

1. **Historic Inquire Boulder dataset.** Endpoint as in §2.2.
   - 62,265 requests between 2013-07-11 and 2019-12-31.
   - Fields: `Entered_via` (Phone, Web…), `Department`, `Topic`, `Entered_date`. **There is no address, location, status, or free text.**
   - Frozen: `editingInfo.lastEditDate` = 1598498050067 (2020-08-27).
   - **145 Department × Topic pairs.** The top topics by volume:

| Requests | Department — Topic |
|---|---|
| 6,430 | Community Vitality — Broken Parking Meter or Pay Station |
| 5,757 | City Council — Council Email |
| 3,690 | Public Works — Potholes |
| 3,291 | Public Works — Graffiti |
| 3,187 | Parks and Recreation — Public Tree Issues |
| 2,591 | Public Works — Water System Maintenance |
| 2,063 | Public Works — Snow Plow Request |
| 1,902 | Public Works — Debris, Trash and Road Kill |
| 1,331 | Police — Trash Concerns |
| 1,278 | Public Works — Drinking Water Quality |

   **Topics touching BFF's population, all with very small counts:**
   - Human Services — Contact Human Services (61)
   - Housing and Human Services — Contact Human Services (26)
   - Housing and Human Services — **Report Syringes (2)**
   - Police — Smoking in Public Places (68)
   - Police — Illegal Use of a Dumpster (63)
   - Parks and Recreation — Pearl Street Mall (57)
   - Library — Contact Boulder Public Library (20)
   - Public Works — Transit (Bus Service) (45)
   - Information Technology — Connect Boulder / Connect Boulder Wi-Fi (37 + 8)

   There is **no** camping or encampment topic in 2013–2019.

2. **Live encampment slice of Inquire Boulder** (SAMPSReportsPublic layer 6).
   - Every row has `REQTOPIC` = "Report Unsanctioned Camping".
   - 5,145 rows. The latest `ENTERDT` is 2026-10-14. One row has a bad date of 1677.
   - Has status, close reason, location description, and free-text notes.
   - **It exposes requester address on 3,151 rows.**
   - So Inquire Boulder is still in operation. The city simply does not publish the other topics.
   - The current list of Inquire Boulder request topics is not available as open data. It would have to be read off the Inquire Boulder portal itself (not fetched; **UNVERIFIED**).

### 3.2 Is it useful for BFF?

| Possible use | Verdict |
|---|---|
| Needs taxonomy | **No.** Boulder's topics describe city operations, not human needs. Denver (§4) is a better model, and memo 04's needs lexicon is better still. |
| Demand or hot-spot signals | **Weak.** The historic data has no location and stops in 2019. |
| Environmental signals (e.g., "syringe reports near X") | **No.** There were 2 syringe reports total. |
| Encampment-response signals | **Technically yes, ethically fraught.** The data is live and daily: inspections 2026-11-13, clean-ups 2026-11-13. A staff-only, aggregated "recent notice posted in zone" alert could protect people's belongings. A public map would put people at risk. Needs a BFF policy decision (§6). |
| Context for grant writing or advocacy | **Yes.** Example: count SAMPS clean-ups per month, or `PROPSTORED` rates. |

---

## 4. Denver 311 — taxonomy reference

- **Source:** City and County of Denver ArcGIS Online (org `zdB7qR0BtYrg0Xpl`).
  - Yearly hosted layers `https://services1.arcgis.com/zdB7qR0BtYrg0Xpl/arcgis/rest/services/311_Service_Requests_{2007…2023}/FeatureServer/0`.
  - 2024 published as a CSV item: `https://www.arcgis.com/sharing/rest/content/items/79f43c95bf9a4ac19ef8217c5367e6c4/data` (97.6 MB, verified header).
- **Schema** (2023 layer, 474,695 rows):
  - `Case_Summary, Case_Status, Case_Source` (PocketGov, Phone, Email…), `Case_Created_dttm, Case_Closed_dttm, First_Call_Resolution, Incident_Address_1, Incident_Zip_Code, Latitude, Longitude, Agency, Division, Major_Area, Type, Topic, Council_District, Police_District, Neighborhood`.
  - In 2021–2024 `Division`, `Major_Area`, `Type`, and `Topic` are **all null**. **The usable hierarchy is two levels: `Agency` → `Case_Summary`.**
  - (I could not confirm whether older years fill `Major_Area`/`Type`/`Topic`; **UNVERIFIED**.)
- **Agencies and leading request types, 2023** (counts from `outStatistics` group-by per agency):

| Agency (2023 count, # distinct Case_Summary) | Top request types |
|---|---|
| **Safety** (142,120; 83) | Online Report, General Info 49,507 · **Encampment Reporting 23,435** · In Progress (Transfer 911) 13,813 · Denver Non-Emergent Dispatch 12,782 · Trespass/Unwanted Person 1,837 · **Welfare Check 761** · Debris/Hazard 1,470 |
| **Finance** (63,664; 38) | Property Tax 14,109 · Vehicle Registration 10,651 · DMV & State 9,634 · **Rebate Programs 89** |
| **Public Works** (56,458; 704) | Pothole 6,708 · Service Schedule 4,834 · Illegal Parking 2,985 · Recycling/Disposal 1,482 · Storm Drain 807 |
| **311** (48,343; 265) | City & County of Denver (info) 11,100 · DPD Non-Emergency 9,454 · Abandoned Vehicle 7,699 · Out-of-Jurisdiction 3,524 · Park Ranger 424 |
| **Excise & License** (40,872; 113) | business, liquor, and marijuana licensing |
| **Community Planning & Development** (28,348; 98) | Sidewalk Snow Removal 7,339 · Weeds 6,347 · Trash in Yard 1,106 |
| **Public Health & Environment** (26,591; 145) | Animal services (adoption, lost pet, barking dog) · Mold 331 · Noise · **Animal Excrement 243** |
| **Clerk & Recorder** (23,067; >1,000 free-text) | Marriage, ballots, recording, voter registration |
| **External Agency** (17,489; 33) | **Courts 5,451** · NDHC (Denver Health) 3,869 · Information 2,055 · **General Assistance 340** · **HRCP – Eviction Assistance 172** · **Evictions with Court Summons 79** · Bus Stop Issue 273 · **211 United Way 49** · **ERAP/State 34** · **Office on Aging 32** · Power Outage 61 |
| **Parks & Recreation** (7,658; 69) | Rec Center/Programs 1,374 · Park Maintenance 735 · **Restrooms 127** · Trash 104 · **Camping 32** · Snow on Sidewalks 58 |
| **Denver Human Services** (1,791; 16) | **Medicaid (Health First Colorado) 580 · Other Resources 409 · Child Care Assistance (CCAP) 336 · Medicaid Plan Enrollment 141 · Workforce Center 92 · Hunger Free Colorado 47 · Rocky Mountain Human Services 42 · PEAK Help Desk 41 · Outreach Team/GA Services 33 · 211/311 27 · LEAP (energy assistance) 26 · Adult Protection/Child Welfare 7 · Child Support 4 · GIVE Center 3 · RTD LiVE (reduced fare) 2 · Migrant Services 1** |
| Mayor's Office (9,895), City Council (6,200), Tech Services (2,191) | Mostly email subjects stored as free text (including "Mayor – Homeless" 160). Not a taxonomy. |

- **Full data:** the per-agency type lists with counts were saved during research to the scratchpad file `denver_311_2023_taxonomy.json`. That file is not in the repo; regenerate it with recipe §5.6.

### Lessons for BFF's taxonomy

1. **Real 311 systems sort requests by department first** (Agency → Case_Summary), not by need. Human-services needs show up in four agencies: Safety, External Agency, Human Services, and Parks.
   - This confirms memo 04's plan: BFF should be **needs-first** (needs lexicon → 72 service categories), with "which agency or provider" as an attribute.
2. **Denver's human-services leaves map well to BFF categories:**
   - Medicaid → health coverage
   - CCAP → child care
   - LEAP → utilities
   - RTD LiVE → transit fare
   - Eviction Assistance / ERAP → housing stabilization
   - Hunger Free CO → food / SNAP
   - Office on Aging → older adults
   - Outreach Team / General Assistance → street outreach
   - 211 → referral

   These make good **crosswalk test cases** for the matcher.
3. **"Out of jurisdiction" and "transfer" are first-class outcomes** in Denver (OOJ 3,524; "Transferred to External Agency" status; "Other Jurisdiction (Boulder Co…)" 745). BFF's support-plan generator should likewise route explicitly to "call 211 / Coordinated Entry" when nothing local matches.
4. **Encampment reporting is Denver's #2 Safety request type**, and Parks has a separate "Camping" type. A 311 system's view of homelessness is enforcement-oriented. BFF's taxonomy should not inherit that framing.
5. **Other Denver open layers whose schemas are useful models:**
   - Cold Weather Activation Shelters: `…/Cold_Weather_Activation_Shelters/FeatureServer/0`, fields `Name, Address, Phone, Cold_Weather_Activation, Cold_Weather_Activation_Notes, Population_Served_Description`, 7 rows, last edited 2022-11-29.
   - Food Assistance: `…/ODC_HLTH_FOODASSIST_P/FeatureServer/473`, `TYPE` = Food Pantry / Mobile Pantry / Food Bank, 195 rows, Denver only.
   - Park Restrooms: `…/ODC_PARK_RESTROOMS_P/FeatureServer/93`, includes a `HEATED` flag, 65 rows.

   BFF's seasonal-activation and restroom models should copy fields like `HEATED`, `Cold_Weather_Activation`, and `Population_Served_Description`.

---

## 5. Ingestion recipes

All URLs below were run on 2026-11-14. "OK" means the service returned data.

### 5.1 Discover what a portal has (catalog sweep, weekly)

```bash
# DCAT-US feed: every public dataset, its modified date, license and distributions (OK: 190 city, 105 county)
curl -s https://open-data.bouldercolorado.gov/api/feed/dcat-us/1.1.json
curl -s https://opendata-bouldercounty.hub.arcgis.com/api/feed/dcat-us/1.1.json
# OGC API Records search with paging (OK; returns links[rel=next])
curl -s "https://open-data.bouldercolorado.gov/api/search/v1/collections/dataset/items?q=311&limit=50&startindex=0"
# Unlisted layers in an org (OK) — this is how the restroom/fountain, transit-stop, food and shelter layers were found
curl -s "https://www.arcgis.com/sharing/rest/search?q=restroom%20orgid:ePKBjXrBZ2vEEgWd&num=100&f=json"
curl -s "https://www.arcgis.com/sharing/rest/search?q=shelter%20orgid:0jWpHMuhmHsukKE3&num=100&f=json"
# Layers inside a web map (OK)
curl -s "https://www.arcgis.com/sharing/rest/content/items/7258290db33c483c99d8343ff606548d/data?f=json"
```

Store each item's `modified` value. If it changes, or a new item matches a watched keyword, open a review task so a human decides whether to add it.

### 5.2 Change detection per layer (daily)

```bash
# Hosted FeatureServer: editingInfo.dataLastEditDate (epoch ms)  — OK
curl -s "https://services.arcgis.com/ePKBjXrBZ2vEEgWd/arcgis/rest/services/Inquire_Boulder_Customer_Service_Portal_Requests_by_Topic/FeatureServer/0?f=json" | jq .editingInfo
#  -> {"lastEditDate":1598498050067,"schemaLastEditDate":1598498050067,"dataLastEditDate":1598498050067}

# Enterprise MapServer (no editingInfo): use MAX(last_edited_date) — OK
curl -s -G "https://gis.bouldercolorado.gov/ags_svr2/rest/services/parks/ParkSitesOpenData/MapServer/0/query" \
  --data-urlencode "where=1=1" \
  --data-urlencode 'outStatistics=[{"statisticType":"max","onStatisticField":"LAST_EDITED_DATE","outStatisticFieldName":"mx"}]' \
  -d f=json
# Layers with no edit-date field (e.g. county Libraries, Narcan): returnCountOnly + SHA-256 of the sorted feature JSON.
```

- **Order of checks:** use `editingInfo.dataLastEditDate`, then `MAX(edit field)`, then count plus content hash.
- **Schema changes:** compare the `fields[]` array to the stored schema. `schemaLastEditDate` also signals this on hosted layers. Alert when a field is added or removed.
- **GTFS:** compare `feed_info.txt` `feed_version`.
- **GTFS-RT:** use `If-None-Match` with the ETag.

### 5.3 Full pull with pagination

```bash
L=https://gis.bouldercolorado.gov/ags_svr2/rest/services/parks/ParkSitesOpenData/MapServer/0
# maxRecordCount from ?f=json (1000 here; 2000 on most hosted layers). Page until exceededTransferLimit is absent.
curl -s "$L/query?where=1%3D1&outFields=*&orderByFields=OBJECTID&resultOffset=0&resultRecordCount=1000&outSR=4326&f=geojson"
# Verified on Inquire Boulder: resultOffset=2000&resultRecordCount=2000&f=geojson -> 2000 features, properties.exceededTransferLimit=true
```

- **Always** pass `orderByFields=<OID>` so pages are stable.
- If `supportsPagination` is false, page by OID ranges instead: `where=OBJECTID>last`.
- Hub CSV download, e.g. `https://open-data.bouldercolorado.gov/api/download/v1/items/<itemId>/csv?layers=0`, answers **302** to a cached replica file. Use `-L`. It is fine for bulk pulls, but the cache can lag the live layer.

### 5.4 Filtered pulls (Boulder subset of state and federal layers)

```bash
# CDPHE health facilities in Boulder County — OK (182)
curl -s -G https://services3.arcgis.com/66aUo8zsujfVXRIT/arcgis/rest/services/CDPHE_Health_Facilities/FeatureServer/0/query \
  --data-urlencode "where=County='Boulder'" -d outFields=* -d outSR=4326 -d f=geojson
# SNAP retailers in Boulder — OK (46). Better: spatial filter on BFF's service-area polygon:
curl -s -G https://services1.arcgis.com/RLQu0rK7h4kbsBq5/arcgis/rest/services/snap_retailer_location_data/FeatureServer/0/query \
  --data-urlencode "where=State='CO'" \
  --data-urlencode 'geometry={"xmin":-105.35,"ymin":39.95,"xmax":-105.05,"ymax":40.12,"spatialReference":{"wkid":4326}}' \
  -d geometryType=esriGeometryEnvelope -d inSR=4326 -d spatialRel=esriSpatialRelIntersects -d outFields=* -d outSR=4326 -d f=geojson
# LADDERS (OK, 17 for City='Boulder'); Syringe disposal (OK, 6)
curl -s "https://www.cohealthmaps.dphe.state.co.us/arcgis/rest/services/OPEN_DATA/cdphe_cdhs_colorado_ladders/MapServer/0/query?where=City%3D'Boulder'&outFields=*&f=geojson"
curl -s "https://maps.bouldercounty.org/arcgis/rest/services/HEALTH/PrescriptionDropOffExchange/MapServer/0/query?where=Syringe%3D'Y'&outFields=*&outSR=4326&f=geojson"
# FindTreatment.gov — OK with lat,lng (address string returned "Invalid request")
curl -s "https://findtreatment.gov/locator/exportsAsJson/v2?sAddr=40.015,-105.27&limitType=2&limitValue=16093&pageSize=100&page=1&sort=0"
# HRSA — OK (full CSV; filter Site State Abbreviation='CO')
curl -sL -o hrsa.csv https://data.hrsa.gov/DataDownload/DD_Files/Health_Center_Service_Delivery_and_LookAlike_Sites.csv
# RTD
curl -sL -o rtd.zip https://www.rtd-denver.com/files/gtfs/google_transit.zip
curl -s -o alerts.pb https://www.rtd-denver.com/files/gtfs-rt/Alerts.pb
```

### 5.5 Aggregates without downloading rows (used for the 311 analysis)

```bash
B=https://services.arcgis.com/ePKBjXrBZ2vEEgWd/arcgis/rest/services/Inquire_Boulder_Customer_Service_Portal_Requests_by_Topic/FeatureServer/0
curl -s -G "$B/query" --data-urlencode "where=1=1" \
  --data-urlencode "groupByFieldsForStatistics=Department,Topic" \
  --data-urlencode 'outStatistics=[{"statisticType":"count","onStatisticField":"ObjectId","outStatisticFieldName":"n"}]' \
  --data-urlencode "orderByFields=n DESC" -d f=json      # OK: 145 groups
```

### 5.6 Denver taxonomy extraction

- Grouping by `Agency,Case_Summary` across the whole layer hits the 1,000- and 2,000-row limits. Statistics paging with `resultOffset` **failed** (HTTP 400) past offset 2,000.
- What worked: list agencies first, then group `Case_Summary` per agency:

```bash
D=https://services1.arcgis.com/zdB7qR0BtYrg0Xpl/arcgis/rest/services/311_Service_Requests_2023/FeatureServer/0
S='[{"statisticType":"count","onStatisticField":"ObjectId","outStatisticFieldName":"n"}]'
curl -s -G "$D/query" --data-urlencode "where=1=1" --data-urlencode "groupByFieldsForStatistics=Agency" --data-urlencode "outStatistics=$S" -d f=json
curl -s -G "$D/query" --data-urlencode "where=Agency='Denver Human Services'" --data-urlencode "groupByFieldsForStatistics=Case_Summary" \
  --data-urlencode "outStatistics=$S" --data-urlencode "orderByFields=n DESC" -d f=json      # OK: 16 types
```

### 5.7 Pipeline mapping

Map each source into the memo 04 model as follows:

1. **`source` row per layer.** Store the URL, license, poll cadence, change-detection method, and `last_seen_edit`.
2. **Raw snapshot.** Store each pull as GeoJSON, keyed by `(source_id, fetched_at)`, in object storage.
3. **Normalize to HSDS `location`.** For place layers, write `organization` and `service` only where the source has them (e.g. LADDERS, FindTreatment).
   - For amenity layers (restroom, fountain, Wi-Fi, bench, transit stop), use a BFF `amenity` side table: `amenity_type`, `seasonality` (from `RESTROOM` = Summer / 3 Season / Year Round), `source_record_id`.
4. **Field assertions.** Each field becomes an assertion with source and confidence. Resolver rules:
   - Live government feeds win for geometry and existence.
   - Human-verified data wins for hours and eligibility.
5. **Deletions.** When a record disappears from a live feed, mark it `inactive_pending_review`. Never hard-delete.
6. **Strip sensitive fields at ingest:**
   - `DONORPHONE`, `DONOREMAIL`
   - `USER_EMAIL`
   - `REQRADDR`, `NOTE`, `ENTEREDBY`
   - `POCEMAIL`, `POCPHONE`
   - DV shelter addresses

### 5.8 Suggested cadence

| Cadence | Sources |
|---|---|
| Real-time (≤ 5 min, only if the app shows transit) | RTD GTFS-RT Alerts |
| Daily | Emergency Area Closures, EOC Shelters (`OPSSTATUS`), SNAP, Transit Stops, Drop Boxes/Syringe, Naloxone |
| Weekly | Park Sites, Wi-Fi, Libraries, CDPHE facilities, LADDERS, FindTreatment, HRSA, RTD static GTFS (also check runboard dates) |
| Monthly | catalog sweeps (DCAT plus AGOL org search) for new layers |
| Once | COVID amenity/restroom/fountain layer, Food Resources, Shelters for Unhoused, FRS/Age Well, Youth Resources |

---

## 6. Open questions

1. **SAMPS / encampment data policy.** Will BFF use the live encampment notice and clean-up layers at all? If so, only staff-side, only aggregated, and never stored at point level? Should BFF tell the City that `SAMPSReportsPublic/6` publicly exposes requester addresses and free-text notes?
2. **Drinking fountains and restrooms.** Does Parks & Rec keep a current amenity inventory? `Asset_Inventory_Map_2_0` on `ags_svr2/parks` requires a token. BFF could ask the City for a public view of restrooms and fountains, including winterization status. Today the only fountain points are the 2021 COVID layer.
3. **Rec-center showers, charging, and day-use rules.** None of this is in open data. It has to be curated by hand, or obtained by asking Boulder Parks & Rec.
4. **Cooling/warming and severe-weather activations.** No machine-readable feed was found from the City or the County. The county's "Shelters for Unhoused" layer is from 2023. Could the City or HSBC publish an activation flag (as Denver did with `Cold_Weather_Activation`)? Until then, the trigger has to be weather-based (see memo 03).
5. **Licenses.** These need confirming before public redistribution:
   - the unlisted city layers (COVID status, Transit Stops, Outdoor Furniture)
   - the county AGOL layers (Food Resources, Shelters for Unhoused, EOC Shelters)
   - CDPHE/LADDERS
   - FindTreatment.gov
   - RTD GTFS

   CC0 / CC BY 4.0 are confirmed only for the catalog-listed items shown.
6. **GTFS join key.** Confirm that city `TransitStop.BSID` equals RTD `stops.txt` `stop_code` (or `stop_id`) before merging shelter and bench attributes onto GTFS stops.
7. **Current Inquire Boulder topic list.** The live portal's request categories were not captured. If BFF wants Boulder-specific 311 deep links (e.g. "report a needle"), someone should list the current Inquire Boulder topics by hand.
8. **Denver older years.** Do 2007–2020 Denver layers fill `Major_Area`/`Type`/`Topic`? If so, they would give a deeper 3–4 level reference hierarchy. Not checked.

---

## 7. Sources

All accessed 2026-11-14.

**City of Boulder**
- Open data portal: https://open-data.bouldercolorado.gov/ ; DCAT feed https://open-data.bouldercolorado.gov/api/feed/dcat-us/1.1.json ; OGC records https://open-data.bouldercolorado.gov/api/search/v1/collections
- 311 tag search: https://open-data.bouldercolorado.gov/search?collection=dataset&tags=311
- Inquire Boulder dataset: https://open-data.bouldercolorado.gov/datasets/Boulder::inquire-boulder-customer-service-portal-requests-by-topic ; REST https://services.arcgis.com/ePKBjXrBZ2vEEgWd/arcgis/rest/services/Inquire_Boulder_Customer_Service_Portal_Requests_by_Topic/FeatureServer/0
- City open data terms: https://bouldercolorado.gov/services/open-data
- GIS servers: https://gis.bouldercolorado.gov/ags_svr1/rest/services , https://gis.bouldercolorado.gov/ags_svr2/rest/services , https://gis.bouldercolorado.gov/ags_svr3/rest/services
- Park Sites: https://gis.bouldercolorado.gov/ags_svr2/rest/services/parks/ParkSitesOpenData/MapServer
- COVID status (restrooms/fountains): https://gis.bouldercolorado.gov/ags_svr2/rest/services/parks/StatusCOVID19/MapServer ; web map https://www.arcgis.com/home/item.html?id=7258290db33c483c99d8343ff606548d
- Outdoor furniture: https://gis.bouldercolorado.gov/ags_svr2/rest/services/parks/OutdoorFurniturePublic/MapServer/0
- Wi-Fi: https://gis.bouldercolorado.gov/ags_svr1/rest/services/IT/ConnectBoulderWifi/MapServer/0 ; catalog page https://open-data.bouldercolorado.gov/datasets/48df2efe142f44bbb6c67c13d8a2eb07_0
- Transit stops: https://gis.bouldercolorado.gov/ags_svr3/rest/services/trans/TransitStop/MapServer/0
- SAMPS: https://gis.bouldercolorado.gov/ags_svr1/rest/services/IT/SAMPSPublic/FeatureServer , https://gis.bouldercolorado.gov/ags_svr1/rest/services/IT/SAMPSReportsPublic/FeatureServer , https://maps.bouldercolorado.gov/arcgis/rest/services/IT/SAMPSOpenData/MapServer ; web map https://www.arcgis.com/home/item.html?id=4493831aa6ae4fb49218abb39d2200f7
- FRS/OAS: https://services.arcgis.com/ePKBjXrBZ2vEEgWd/arcgis/rest/services/FRS_and_OAS_locations_map/FeatureServer/0
- Homelessness attendance: https://open-data.bouldercolorado.gov/datasets/Boulder::attendance-in-boulder-homelessness-system-adult-programs

**Boulder County**
- Open data: https://opendata-bouldercounty.hub.arcgis.com/ ; DCAT https://opendata-bouldercounty.hub.arcgis.com/api/feed/dcat-us/1.1.json
- Prescription drop boxes: https://opendata-bouldercounty.hub.arcgis.com/datasets/bouldercounty::prescription-drop-boxes
- Naloxone: https://opendata-bouldercounty.hub.arcgis.com/datasets/bouldercounty::pharmacies-providing-naloxone-narcan
- Libraries: https://opendata-bouldercounty.hub.arcgis.com/datasets/bouldercounty::libraries-2
- Emergency closures: https://opendata-bouldercounty.hub.arcgis.com/datasets/bouldercounty::emergency-area-closures-public-view
- County AGOL layers: https://services3.arcgis.com/0jWpHMuhmHsukKE3/arcgis/rest/services/Food_Resources/FeatureServer , …/Shelters_for_Unhoused/FeatureServer , …/EOC_Shelters__Public_VIEW/FeatureServer , …/Youth_Resources/FeatureServer
- County GIS server: https://maps.bouldercounty.org/arcgis/rest/services

**Colorado / federal**
- data.colorado.gov catalog API: https://api.us.socrata.com/api/catalog/v1?domains=data.colorado.gov
- CDPHE Health Facilities: https://data.colorado.gov/dataset/CDPHE-Health-Facilities/whj7-3xqj ; https://geodata.colorado.gov/datasets/CDPHE::cdphe-health-facilities ; REST https://services3.arcgis.com/66aUo8zsujfVXRIT/arcgis/rest/services/CDPHE_Health_Facilities/FeatureServer/0
- CDHS LADDERS: https://data.colorado.gov/dataset/CDHS-LADDERS-Substance-use-disorder-and-mental-hea/fzag-perc ; REST https://www.cohealthmaps.dphe.state.co.us/arcgis/rest/services/OPEN_DATA/cdphe_cdhs_colorado_ladders/MapServer/0
- SAMHSA CO providers: https://data.colorado.gov/dataset/SAMHSA-Colorado-Substance-Abuse-and-Mental-Health-/k92v-ywav
- FindTreatment.gov: https://findtreatment.gov/locator/exportsAsJson/v2
- HRSA sites: https://data.hrsa.gov/DataDownload/DD_Files/Health_Center_Service_Delivery_and_LookAlike_Sites.csv
- USDA SNAP retailers: https://services1.arcgis.com/RLQu0rK7h4kbsBq5/arcgis/rest/services/snap_retailer_location_data/FeatureServer/0
- Boulder County child care (Socrata): https://data.colorado.gov/Human-Services/Boulder-County-Licensed-Child-Care-facilities/abkc-n6kt
- Boulder County restaurant inspections: https://data.colorado.gov/Health/Restaurant-Inspections-in-Boulder-County-2013-2025/tuvj-xz3m
- HUD: https://services.arcgis.com/VTyQ9soqVukalItT/arcgis/rest/services/Public_Housing_Developments/FeatureServer/0 ; https://services.arcgis.com/VTyQ9soqVukalItT/arcgis/rest/services/Continuum_of_Care_Grantee_Areas/FeatureServer/0

**Transit**
- RTD GTFS page: https://www.rtd-denver.com/open-records/open-spatial-information/gtfs
- Static feed: https://www.rtd-denver.com/files/gtfs/google_transit.zip
- Realtime: https://www.rtd-denver.com/files/gtfs-rt/Alerts.pb , …/TripUpdate.pb , …/VehiclePosition.pb

**Denver**
- 311 layers: https://services1.arcgis.com/zdB7qR0BtYrg0Xpl/arcgis/rest/services/311_Service_Requests_2023/FeatureServer/0 (and `_2007`…`_2022`)
- 2024 CSV: https://www.arcgis.com/home/item.html?id=79f43c95bf9a4ac19ef8217c5367e6c4
- Denver open data hub: https://opendata-geospatialdenver.hub.arcgis.com/ ; PocketGov: https://www.denvergov.org/pocketgov/
- Cold Weather Activation Shelters: https://services1.arcgis.com/zdB7qR0BtYrg0Xpl/arcgis/rest/services/Cold_Weather_Activation_Shelters/FeatureServer/0
- Food Assistance: https://services1.arcgis.com/zdB7qR0BtYrg0Xpl/arcgis/rest/services/ODC_HLTH_FOODASSIST_P/FeatureServer/473
- Park Restrooms: https://services1.arcgis.com/zdB7qR0BtYrg0Xpl/arcgis/rest/services/ODC_PARK_RESTROOMS_P/FeatureServer/93

**Discovery**
- ArcGIS Online search API: https://www.arcgis.com/sharing/rest/search (queries with `orgid:` filters as shown in §5.1)
