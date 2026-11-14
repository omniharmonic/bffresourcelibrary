# 03 — Boulder Service Landscape & Data Sources

_Researched 2026-11-14. Scope: live services for unhoused people in Boulder / Boulder County, where each provider publishes its information, how refreshable it is, and how BFF's 111-record dataset (`reference/libby-mockup-index.html`, `window.BFF_DATA` v3.0) compares. Items not confirmed against a primary source are marked **UNVERIFIED**._

---

## 1. Summary

- **The local "street sheet" already exists, and a machine can watch it.** All Roads (formerly Boulder Shelter for the Homeless) publishes a two-page **Community Resource Guide** PDF in English and Spanish. It is the closest thing Boulder has to a canonical street sheet, and its content overlaps heavily with BFF's records. All Roads calls it "monthly," but in practice it comes out irregularly: May, July and August 2026 editions exist, and the August edition (internally "Last updated 8/9/2026") was only uploaded on 2026-10-09. All Roads runs WordPress, so the WP media API (`/wp-json/wp/v2/media?search=resource`) lists every new upload with a timestamp. That makes it a near-perfect change trigger for a pipeline.
- **Coordinated Entry (CE) is the front door for every adult service, and its published hours disagree across official sources.** At least four official sources give three different schedules (see §3.3). A field tool must not print CE hours from just one of them.
- **Recent landscape changes the dataset needs to reflect:**
  - The city's **CARE and CIRT** programs ended in 2025 and were replaced by **Behavioral Health Crisis Response (BHCR)**.
  - **Bridge House closed Community Table Kitchen** on 2026-08-07. Ready to Work Boulder continues.
  - **All Roads added a 10-day stay limit** for people without Boulder County ties (effective 2026-05-04, paused in winter from about Nov 1).
  - **Community Court and Deacon's Closet moved to St. John's Episcopal** (2026-07-23).
  - **Camping-ban enforcement increased** in 2025–26, and the ban was upheld on appeal on 2026-05-14 in *Feet Forward v. City of Boulder*.
- **Refreshability splits into five tiers** (§2.2):
  - Most institutional providers run **WordPress**, whose REST API exposes page `modified` timestamps for cheap change detection.
  - County and city pages are **Drupal or WordPress** HTML.
  - Key schedules live in **PDFs**.
  - Several sites **block bots (HTTP 403)**.
  - **Almost every free-meal and mutual-aid event** (Circle of Love, Unity Table, SAFE Boulder, Food Not Bombs, Friends for Homeless Dignity, Larry & Volunteers) has **no machine-readable source at all**. Those need a human or peer verification loop. That is BFF's comparative advantage.
- **Gaps in BFF's data:** about 20 notable providers or lines are missing (§3.1). The most field-relevant are:
  - the **city belongings-retrieval hotline** for encampment cleanups
  - the **free All Roads ↔ downtown shuttle**
  - **All Roads Day Services hours** (showers and laundry)
  - **St. Benedict free medical clinics**
  - **Medicaid dental options**
  - **Housing Helpline / HSBC**
  - **severe and critical weather sheltering**
  - **Veterans** services
  - **HOPE Longmont's outreach center and navigation shelter**
- **Staleness found in the BFF spot-check (§3.2):** the CARE record is obsolete, and the Food Not Bombs time is seasonal (3 PM in winter, not 4 PM). Phones for Via Mobility and Centro de los Trabajadores may be outdated. Most phones that BFF does list checked out (Clinica, BCH Counseling, WellMind, SPAN, The Lodge, BCAP, Rocky Mountain Equality, Recovery Café peer line).

---

## 2. Provider inventory

### 2.1 Inventory table

Legend for **Refresh**:
- **A** = structured or API-detectable (WP REST `modified`, events API, media API)
- **B** = static HTML on a CMS (scrape plus diff)
- **C** = PDF
- **D** = site blocks bots or is a Wix site with poor structure (manual or headless browser)
- **E** = no web source or social media only (human verification)

| Provider | What they offer | Published schedule (as found 2026-11) | How published / where | Refresh |
|---|---|---|---|---|
| **All Roads** (formerly Boulder Shelter for the Homeless; renamed July 2024) — 4869 N Broadway, 303-442-4646 | Housing-focused shelter (160 beds in summer, 180 in winter, plus 20 on critical-weather nights); sober dorm; diversion; navigation; Day Services (showers, laundry, lockers, mail, phones, Wi-Fi, charging, lunch 11:45); Permanent Supportive Housing; housing retention | Day Services M–F 9–2. Shelter intake 5–7 PM (street sheet says 4:30–7). Free bus daily: 8 AM shelter → 14th & Walnut, 5 PM back. 10-day limit without local ties (May–Oct) | WordPress site allroadsboco.org. `/get-help` page modified 2026-10-09; `/day-services` last modified 2025-07-07 and has no hours. Monthly resource guide PDF (ENG/SP) in `/wp-content/uploads/YYYY/MM/`. City and county pages restate hours | **A** (WP REST pages + media) / **C** |
| **Coordinated Entry — Homeless Solutions for Boulder County (HSBC)** — 303-579-4404 (Boulder); 720-453-6096 (Longmont) | Required screening for single adults (18+) → diversion, navigation, housing-focused shelter | Conflicting (see §3.3). Longmont: phone M–F 12–7; walk-in M/T/Th/F 12–5 at HOPE (804 S Lincoln) and Wed 12–5 at 1335 Francis St (per All Roads) | bouldercounty.gov (WordPress; homeless-services page modified 2026-09-25); city page (Drupal 11); All Roads page; 2026 county navigation-map PDFs dated "4/26" | **A/B/C** |
| **Boulder County Housing Helpline / HSBC admin** — 303-441-1206, housinghelpline@bouldercounty.gov | General housing questions; HSBC coordination | Leave a message | bouldercounty.gov; navigation-map PDFs | B/C |
| **City of Boulder Homelessness Services** | Policy owner; Extreme Weather Shelter; Homeless Outreach Team; BTHERE outreach; Building Home; Community Court; Public Spaces | Varies | bouldercolorado.gov (Drupal 11, no last-updated dates). News posts and GovDelivery bulletins (account `COBOULDER`) for activations. Homelessness Services dashboard | B (+ GovDelivery for alerts) |
| **Behavioral Health Crisis Response (BHCR)** (City; replaced CARE and CIRT, which ran 2021–2025) | Clinician/case-manager co-response or alternative response to 911 and non-emergency calls | "Program hours" not published. Request via 911 or non-emergency 303-441-3333. Program questions 303-709-4291 (not crisis; not monitored on weekends) | bouldercolorado.gov/services/behavioral-health-crisis-response | B |
| **WellMind Connection / CAT** (Boulder County) — 303-441-1300, wellmind@bouldercounty.gov | Free behavioral-health navigation; the Crisis Assistance & Treatment team is activated through it | M–F 9–6 per county page; an older bulletin says noon–4 (**UNVERIFIED** which is current) | wellmindconnection.org (WordPress; pages last modified June 2025) | A |
| **Clinica Family Health & Wellness** (Clinica merged with Mental Health Partners in Oct 2024) | Primary care (People's Clinic, 2525 13th St, 303-650-4460); behavioral health new clients 303-443-8500; withdrawal management 303-441-1281; **24/7 Walk-in Crisis Center & Addiction Services, 1107 W Century Dr, Louisville**; Works site 24/7 | Medical: M/W/F 8–5, T/Th 8–9 (street sheet) | clinica.org (WordPress); mhpcolorado.org legacy site still live (confusing) | A |
| **BCH Counseling Center (Della Cava Pavilion)** — 4801 Riverbend Rd Ste 120a, 303-415-4299 | Outpatient behavioral health. BCH **Pillar**: free substance-use care coordination | M–Th 8–4:30, F 8–3:30 | bch.org (static) | B |
| **Boulder County Public Health — The Works** | Syringes and supplies, naloxone, fentanyl test strips, wound care, vaccines, HIV/HCV testing, criminal-justice diversion | Boulder: BCAP, 2118 14th St, M–F 2–5. Louisville: Clinica 24/7. Longmont: 515 Coffman 2nd floor, M–F 10:30–4:30. Lafayette: vending machine, 1755 S Public Rd. Main line 720-864-6515 (Longmont); an older page says 303-413-7500 (**UNVERIFIED**) | bouldercounty.gov/families/disease/the-works-program (WordPress) | A/B |
| **Boulder County AIDS Project (BCAP)** — 303-444-6121 | HIV, HCV and STI testing; Works site | M–F 2–5 (Works) | bcap.org (Wix) | D |
| **EFAA** — 1575 Yarmouth Ave, 303-442-3042 | Food bank, rent and deposit assistance, family housing, case management | efaa.org: appointments M–F 9:30–4:30; food bank M/T/W/F 12–4:30, Th 12–7; **closed first Wednesday monthly**. The county map gives different hours (see §3.3). Street sheet says the food bank needs proof of local residency | WordPress plus pop-up closure alerts | A |
| **Harvest of Hope Pantry** — 4830 Pearl St, 720-382-1971 | Groceries; people without a kitchen can use it; no ID (per Bridge House page); pet food (BFF) | Homepage: Tu/Th 9–6:30 (from 2026-04-02), Saturdays recommended during construction. Street sheet adds "M–Sa 9–2". Closed Nov 26–28, 2026 | hopepantry.org (WordPress) plus Facebook | A |
| **Community Food Share** — 650 S Taylor Ave, Louisville | Food bank onsite pantry; mobile pantries across the county; Blue Spruce (60+) | Onsite: W 9–3, Th 12–6, F 9–3. Needs photo ID plus proof of Boulder/Broomfield address | communityfoodshare.org: embedded events calendar plus a separate mobile-pantry calendar and Food Finder map | A/B |
| **Bridge House — Ready to Work Boulder** — 4747 Table Mesa Dr, 720-325-7431 (site); street sheet lists 720-386-9002 | Up to 12 months of paid transitional work plus dorm housing plus case management (substance testing) | Office M–F 9–5. **Community Table Kitchen closed 2026-08-07**; Aurora Ready to Work closed 2026-09-30 | boulderbridgehouse.org (WordPress; `/about/hours-location/` modified 2026-11-09). Its "Get Help" page carries stale EFAA hours | A |
| **TGTHR** — The Source, 3080 Broadway, 303-447-1207. Admin 303-447-1206 | Youth (12–24) drop-in: meals, showers, laundry, housing and employment help; street outreach; 1440 Pine and Nest56 housing (18–24) | Drop-in M–F 11–5 (county map, Longmont page, street sheet). The Source reopened in 2026 | tgthr.org (WordPress; hours not on homepage) | A/B |
| **Haven Ridge** — 303-447-9602 (main). The Lodge: 720-579-1637 | **The Lodge**: navigation shelter for adult women and transgender people. **Mother House**: pregnant people and mothers with babies. Outreach and peer support (started 2024 with BFF) | Intake by contact form | havenridgeboulder.org (Squarespace; `?format=json` returns JSON) | A- |
| **SPAN (Safehouse Progressive Alliance for Nonviolence)** — hotline 303-444-2424; office 303-449-8623, 835 North St | Domestic-violence shelter, advocacy, counseling | 24/7 hotline | safehousealliance.org (returns **403** to bots) | D |
| **Safe Shelter of St. Vrain Valley** — 303-772-4422 | DV shelter (Longmont) | 24/7 | Longmont city page, street sheet | B/C |
| **HOPE for Longmont** — 804 S Lincoln St, 720-494-4673; after 5 PM 720-453-6999 | Outreach Center (lunch sacks, clothing, mail, document help); Navigation Shelter (via CE: meals, showers, laundry, storage); emergency overnight shelter at ≤25°F or heavy precipitation; day shelter at ≤15°F; street outreach about 20 hrs/week; LTHERE; SafeLot safe parking (per Longmont city page; **UNVERIFIED** current) | Outreach Center M–Th 12–4 (HOPE site). The city page says M–W 12–4 (conflict). City of Longmont posts each severe-weather activation as a news item | hopeforlongmont.org (WordPress + The Events Calendar; `/wp-json/tribe/events/v1/events` responds but has no events). longmontcolorado.gov news | A/B |
| **Recovery Café Longmont** — 402 Kimbark St, 720-815-2885. Boulder pop-up at CUCC, 2650 Table Mesa | Peer recovery community; meals; Recovery Circles | Longmont Tu–F 11–7. **Boulder: Wednesdays 5–8 PM, circle at 6:30** | recoverycafelongmont.org (**403** to curl; WebFetch worked) | D |
| **Focus ReEntry** — 720-662-2577 / 720-662-2576 | ID, housing and peer support for reentry; CE help | At Harvest of Hope (Wed), All Roads (Mon, Wed), Feet Forward (Tue), Deacon's Closet (Thu) | focusreentry.org: **empty page** (no content). Real data is only in the street sheet | E/C |
| **Deacon's Closet** (at St. John's Episcopal, 1419 Pine since 2026-07-23); **Boulder Community Court** (303-441-1841) | Clothing and personal items; ticket resolution (voluntary; "you will NOT be arrested") | Thu 9:30–10:30 AM per street sheet (BFF says about 2–3 PM) | Street sheet; city pages; news | C/E |
| **St. Benedict Health & Healing Ministry** — 303-669-2700 | Free medical care for uninsured or unhoused people | 1st Sunday at St. John's, 2nd at Trinity Lutheran, 4th at First Congregational (street sheet) | Episcopal diocese reports; no site found | C/E |
| **Boulder Public Library** — Main, 1001 Arapahoe, 303-441-3100 | Wi-Fi, computers, charging, restrooms, menstrual products (BFF), Community Resource Connector (since 2024; current status **UNVERIFIED**), community-help LibGuide | Main and branches M–Th 9–7, F 9–5, Sa 10–5, Su 12–5. All closed Fri Nov 20, 2026 | boulderlibrary.org (WordPress); calendar.boulderlibrary.org (Springshare LibCal; iCal/RSS feed links not found on homepage, **UNVERIFIED**); research.boulderlibrary.org LibGuide | A/B |
| **Colorado FriendShip "Meals on the Street"** | Hot meal plus clothing trailer | Sun 5–6 PM, Justice Center lot (6th & Canyon). Permit lapsed in summer 2026, then restored | coloradofriendship.org (WordPress + The Events Calendar; REST endpoint not exposed) | B/E |
| **Church rotation "Sundays at Noon"** | Lunch | 1st St. John's (1419 Pine); 2nd Trinity Lutheran (2200 Broadway); 3rd First United Methodist (1421 Spruce); 4th First Congregational (1128 Pine); 5th All Souls / Pine Street Church | Street sheet only | C/E |
| **Circle of Love; Unity Table; SAFE Boulder; Food Not Bombs; Friends for Homeless Dignity; Larry & Volunteers; Thursday Group** | Meals and mutual aid | Street sheet: Circle of Love Mon/Wed **12:15**, Bandshell. FNB Sat **4 PM in Farmers' Market season, 3 PM in winter**, 13th & Canyon. FHD Wed 10 AM. "Unity Table" is **not findable online** under that name (St. John's grab-and-go Tu/W/Th about 4:30 is the closest match) | No websites or APIs found. Social media / word of mouth | **E** |
| **Journey Church (Longmont)** — 2000 Pike Rd | Meals **and showers** | Sun–Wed 5:30–7 PM (street sheet) | Street sheet | C/E |
| **OUR Center (Longmont)** — 220 Collyer St, 303-772-5529 | Food, meals, clothing, family housing help; Atwood family shelter | — | ourcenter.org (WordPress) | A |
| **Veterans** | VA Homeless Outreach 720-362-0023; Vet Center 303-440-7306; Veterans Community Project Longmont (1228 Main) 720-340-2916 | — | Street sheet; Longmont page | C |
| **Salud Family Health** — 220 E Rogers Rd, Longmont, 303-776-3250 | FQHC primary care (no Boulder-city clinic found) | — | saludclinic.org (Wix) | D |
| **Boulder County Housing & Human Services** — 3460 Broadway; 515 Coffman (Longmont), 303-441-1000 | SNAP, Medicaid, cash and rental assistance (PEAK) | M–F 8–4:30 | bouldercounty.gov | A/B |
| **Other legal and ID** | Bridge to Justice 303-416-6190; Immigrant Legal Center 303-444-1522; Boulder County Mediation 303-441-4364; DMV 4800 Baseline (appointment required); SSA Louisville 877-405-5872 | — | Street sheet | C |
| **City Public Space Reclamation — belongings retrieval** | Hotline to retrieve possessions after encampment cleanup: **303-441-1855** | — | Street sheet | C |
| **211 Colorado** | Statewide directory and after-hours CE fallback | 24/7 | 211colorado.org (data licensing/API **UNVERIFIED**) | B |

### 2.2 Refreshability tiers: what a pipeline should do

| Tier | Providers | Technique |
|---|---|---|
| **A — WordPress REST** | All Roads, Bridge House, EFAA, Harvest of Hope, TGTHR, HOPE, WellMind, Clinica, OUR Center, Community Cycles, Community Food Share, Boulder Food Rescue, bouldercounty.gov | Poll `/wp-json/wp/v2/pages?_fields=slug,modified,link` daily. When `modified` changes, re-fetch `content.rendered` and LLM-extract into the schema. Poll `/wp-json/wp/v2/media?search=resource-guide` to detect new All Roads street sheets |
| **A — Events APIs** | HOPE, Colorado FriendShip (The Events Calendar); library (LibCal) | Try `/wp-json/tribe/events/v1/events` and `?ical=1`. Both currently return nothing useful, so fall back to HTML |
| **B — CMS HTML** | bouldercolorado.gov (Drupal 11; `Last-Modified` header is just the request time, so hash the content instead), longmontcolorado.gov, bch.org | Fetch, strip boilerplate, compute a content hash, diff. Subscribe to City GovDelivery bulletins and Longmont news for severe-weather activations |
| **C — PDFs** | All Roads Community Resource Guide (ENG/SP); county 2026 Housing Navigation Maps (Boulder, East County, North and South Mountains; "Last updated 4/26", with a QR code to the latest version); Boulder County Resource Guide 2024-25; Longmont Resources PDF (Dec 2024) | `pdftotext -layout`, then LLM extraction. The All Roads guide is multi-column, so expect interleaving. Keep the source PDF hash and "last updated" date on each derived record |
| **D — Blocked / Wix** | SPAN, Sister Carmen, Recovery Café (403); BCAP, Salud, Rocky Mountain Equality (Wix); Haven Ridge and Annie & Millie's (Squarespace: try `?format=json`) | Headless browser at low frequency, or treat as manual |
| **E — No web source** | All the street meals and mutual-aid groups; Focus ReEntry; St. Benedict; church rotation | **Human verification loop**: a field volunteer confirms "still happening, same time and place?" with a timestamp. Show the time since last confirmation in the UI |

Note: the **Downtown Boulder Partnership** page mirrors the All Roads guide (at `ctycms.com/co-boulder/docs/{month}-2026-resource-guide-eng.pdf`), but only the August 2026 edition was retrievable. The Sep, Oct and Nov URLs return 403, which suggests they don't exist.

### 2.3 Canonical community resource guides

| Guide | Publisher | Cadence (observed) | URL |
|---|---|---|---|
| **Community Resource Guide** (2-page street sheet, ENG/SP) | All Roads; mirrored by Downtown Boulder Partnership | Billed as "monthly." Actually irregular: May, Jul, Aug 2026; Aug posted 10/9. Corrections go to jack@allroadsboco.org | allroadsboco.org/wp-content/uploads/2026/10/August-2026-Resource-Guide-ENG-1.pdf |
| **Housing Navigation Maps 2026** (decision-tree flowcharts by region, ENG/SP) | Boulder County Family Resource Network | Annual-ish; "Last updated 4/26" | assets.bouldercounty.gov/wp-content/uploads/2026/04/2026-boulder-housing-navigation-maps-english-and-spanish-accessible.pdf |
| **Boulder County Resource Guide for People Experiencing Homelessness** | HSBC | Upload path suggests Feb 2024 (stale) | linked from bouldercounty.gov/departments/community-services/homeless/homeless-services/ |
| **Community Connections Resource Guide 2024-25** | Boulder County | Annual (general population) | assets.bouldercounty.gov/wp-content/uploads/2024/11/community-connections-resourceguide-2024-25-english.pdf |
| **"Where to Get Help" / "Homelessness in Boulder"** | City of Boulder | Undated; edited ad hoc. CE hours shown differ from the county's | bouldercolorado.gov/services/homelessness-services ; bouldercolorado.gov/guide/homelessness-boulder |
| **Resources for People Experiencing Homelessness** | City of Longmont | Web page plus PDF (Dec 24, 2024). The page still links the old bouldershelter.org | longmontcolorado.gov/human-services/resources-for-people-experiencing-homelessness/ |
| **Community Help: Housing & Food** LibGuide | Boulder Public Library | No date. Links the All Roads guide and "Feet Forward" | research.boulderlibrary.org/community-help/housing-food |
| **Homelessness Resources** | Downtown Boulder Partnership | Re-hosts the All Roads guide | boulderdowntown.com/about/homelessness-resources |

---

## 3. Gap & staleness analysis vs BFF data

### 3.1 Providers or lines missing from BFF's 111 records

BFF's data is strong on meals, mutual aid, faith partners, SUD treatment and field nuance (police presence, alias OK, pets). It is thin on the formal system. The keyword audit of `BFF_DATA` found zero hits for each item below.

| Missing | Why it matters in the field |
|---|---|
| **Belongings retrieval after encampment cleanup** (City Public Space Reclamation, 303-441-1855) | Directly tied to sweeps. Lost IDs and meds |
| **All Roads free shuttle** (8 AM shelter → 14th & Walnut; 5 PM back) | Transportation category; makes shelter reachable |
| **All Roads Day Services hours, showers, laundry, mail** (M–F 9–2, lunch 11:45) | The BFF record has the address but no hours. BFF's own gap list says "low-barrier showers beyond All Roads" |
| **Showers elsewhere**: TGTHR Source (youth); Journey Church Longmont (Sun–Wed 5:30–7); Longmont rec centers ($1: Centennial Pool Wed 12–2; Longmont Rec Mon/Thu 12–4; St. Vrain Memorial Tue/Fri 12–3) | Partly answers BFF gap #5 |
| **Severe, critical and extreme weather sheltering** (All Roads +20 beds; city Extreme Weather Shelter; rec-center overflow; HOPE ≤25°F) | No seasonal records exist |
| **St. Benedict free medical clinics** (rotating Sundays at downtown churches) | Free care at the same churches BFF already lists |
| **Clinica People's Clinic** (2525 13th St) and **Salud** (Longmont) primary care | "Medical Care" category relies on BFF and Clinica-as-MHP |
| **Dental**: Dental Aid (4155 Darley, 303-499-7072); Comfort Dental (accepts Medicaid) | BFF has only a "Navigation starting point: Dental Care" placeholder |
| **Housing Helpline / HSBC** (303-441-1206); **EPRAS** eviction prevention (303-441-3414); **LEAP** (Nov–Apr) | Prevention for people about to lose housing |
| **Boulder County Housing & Human Services** (benefits office, PEAK) | SNAP/Medicaid enrollment beyond BFF staff help |
| **Veterans**: VA Homeless Outreach, Vet Center, Veterans Community Project | Only Cultivate VetsGo transport exists |
| **HOPE Longmont Outreach Center, Navigation Shelter, LTHERE, SafeLot** | BFF has only "HOPE Longmont — Shelters". SafeLot speaks to BFF gap #2 (safe parking), **UNVERIFIED** current |
| **OUR Center / Atwood shelter; Mother House; Little Flower Maternity** | Families and pregnancy (BFF covers The Lodge only) |
| **Immigrant Legal Center; Boulder County Mediation; MESA sexual-assault line** (303-442-7300); CO human-trafficking hotline | Legal and safety |
| **Safe Shelter of St. Vrain** (DV, Longmont) | Only SPAN is listed |
| **Community Food Share** onsite and mobile pantries as a *pantry* (BFF lists it for volunteering) | ID and proof-of-address rule matters |
| **DMV and Social Security office** | ID & Documents pathway endpoints |
| **BHCR** (current name for the city's crisis team) | See staleness below |
| **TGTHR street outreach** and the city **Homeless Outreach Team / BTHERE** | Who else is doing outreach (and police-adjacent context) |

The user's prompt also mentioned "Boulder Day Nourishment" and "Attention Homes." No current Boulder Day Nourishment program was found (**UNVERIFIED** — it may not exist under that name). Attention Homes was not researched in depth: TGTHR is the former Attention Homes, renamed in 2019 from memory (**UNVERIFIED**).

### 3.2 Spot-check of BFF records (15 records)

| BFF record | BFF says | Current source says | Verdict |
|---|---|---|---|
| r037 Boulder Behavioral Health Crisis Response / CARE | CARE; "CIRT traditionally responds with police" | CARE and CIRT **ended in 2025**; replaced by **BHCR**. Request via 911 / 303-441-3333; program line 303-709-4291 | **STALE (naming/program)**. Rename and update. BFF's caution about non-police response remains right |
| v2_104 Food Not Bombs | Sat 4:00 PM, Bandshell | 4 PM in Farmers' Market season, **3 PM in winter**; 13th & Canyon near the bandshell | **STALE / seasonal**. Model as two seasonal schedules |
| v2_089/095 Circle of Love | Mon/Wed 12:00–1:00 | Mon/Wed **12:15**, Bandshell | Minor discrepancy |
| r018 Deacon's Closet | St. John's, 1419 Pine, **Thu about 2–3 PM** | Street sheet: **Thu 9:30–10:30 AM** at St. John's | **Conflict**. Confirm in the field. Moved there 2026-07-23 (location correct) |
| r010 Bridge House Ready to Work | No phone or address | 4747 Table Mesa Dr, **720-325-7431**, M–F 9–5 (site, 2026-11-09). Street sheet: 720-386-9002 | **Missing data and a phone conflict** |
| r005 All Roads | Address; washer free / dryer $1; lockers | City: "coin-operated washers with free drying" (the reverse). Day Services M–F 9–2. Intake 5–7 PM. 10-day non-local limit (summer) | **Conflict on laundry pricing**. Add hours and the stay limit |
| r042 Recovery Café Boulder pop-up | Wed about 5–8 PM, 2650 Table Mesa | Wed 5–8 PM, circle 6:30, CUCC 2650 Table Mesa | **Confirmed** |
| r012 TGTHR / The Source | 3080 Broadway, 12–24, M–F about 11–5 | Same (county map, street sheet). Phone 303-447-1207 | **Confirmed**. Add phone |
| r032 Clinica (formerly MHP) | 303-443-8500 | 303-443-8500 new clients (street sheet, MHP site) | **Confirmed** |
| r033 Della Cava / BCH | 303-415-4299 | BCH Counseling Center 303-415-4299, M–Th 8–4:30, F 8–3:30 | **Confirmed**. Add hours |
| r038 WellMind / CAT | 303-441-1300 | Same. Hours M–F 9–6 vs 12–4 conflict | **Confirmed phone** |
| v2_086 The Lodge at Haven Ridge | 720-579-1637 | Street sheet same. Haven Ridge main 303-447-9602 | **Confirmed**. Add main line and contact form |
| r064 SPAN | 303-444-2424 | Same | **Confirmed** |
| r035 Louisville walk-in crisis center | 1107 W Century; "verify 24/7" | City BHCR page and street sheet: 24/7 Walk-in Crisis Center & Addiction Services (Clinica) | **Confirmed**. Can drop "verify" |
| r057 Via Mobility Services | 303-443-3043 | Street sheet: 303-447-2848 ext 1014 | **Phone conflict** (**UNVERIFIED** which is current) |
| v2_085 Centro de los Trabajadores | 303-292-4115 | A newer state guide lists 720-404-1935. The 303 number is from the El Centro Humanitario era | **Possibly stale** (**UNVERIFIED**) |
| v2_106 Colorado FriendShip | Sun 5:00 PM, Justice Center lot | Sun 5–6 PM, Justice Center lot 6th & Canyon. Permit dispute resolved summer 2026 | **Confirmed** |
| r007 "OneHome / Coordinated Entry" | Label "OneHome" | Boulder County CE is run by **HSBC** (303-579-4404). OneHome is the Denver-metro (MDHI) system; how it relates to Boulder's matching is **UNVERIFIED** | **Naming risk**. Use "Boulder County Coordinated Entry (HSBC)" and add the phone |
| r004 Harvest of Hope | No hours | 4830 Pearl. Tu/Th 9–6:30 plus Saturdays. Holiday closure Nov 26–28 | **Missing hours** |
| r009 Sister Carmen | No address | Directories conflict (655 Aspen Ridge Dr vs 455 N Burlington, Lafayette). Site returns 403 | **UNVERIFIED** |

### 3.3 The Coordinated Entry hours problem (design implication)

| Source | Boulder CE hours |
|---|---|
| bouldercounty.gov homeless-services (modified 2026-09-25) | M, W, Th, F 10–4; **Tue 12–4** |
| County 2026 Navigation Map (4/26) | Same as county (English). The Spanish block for EFAA differs from the English |
| bouldercolorado.gov "Where to Get Help" and "Homelessness in Boulder" | **M–F 9–3** |
| All Roads `/get-help` (modified 2026-10-09) | **M–F 9–3** ("call at least 30 minutes before close") |
| All Roads street sheet (8/9/2026) | **M–F 9–2** |

EFAA shows the same pattern: efaa.org says appointments M–F 9:30–4:30. The county map says M/T/Th/F 9:30–4:30 and W noon–4:30. Bridge House's page lists a third, older schedule.

**Implication:** store **every source's claim with its retrieval date**, not one "truth." Surface conflicts ("Hours vary by source — call 303-579-4404") instead of silently picking one. Prefer the operator's own page (All Roads runs CE intake) and the most recent `modified` timestamp.

---

## 4. Seasonal and temporary conditions the system must handle

**Winter sheltering (three tiers in Boulder, plus Longmont):**

| Tier | Trigger | What happens |
|---|---|---|
| **Critical Weather** | NWS blizzard warning or gusts over 70 mph; daytime low ≤20°F; or ≥6" of snow (city page). A Dec 2025 report says below 11°F | All Roads adds 20 beds. Arrive before 7 PM. CE or grace night required. Up to 90 nights. Not guaranteed. When the shelter is full, rec centers (e.g., East Boulder CC / East Age Well Center) have opened as overflow |
| **Extreme Weather Shelter** (City) | Conditions expected to last ≥3 nights and either a daily high ≤5°F with heavy precipitation, blizzard, or strong winds, or a nightly low ≤0°F. Decided on forecasts ≥48 hours ahead | Example: Jan 2026, 24-hour shelter at East Boulder Community Center, 5660 Sioux Dr |
| **HOPE Longmont** | Overnight at ≤25°F or significant precipitation; day sheltering at ≤15°F | Each activation is posted as a City of Longmont news item (e.g., Jan 8–10 and Jan 20–25, 2026). A Nov 15–Mar 15 church warming-center model also exists (adults only, no pets, 6 PM–7 AM) |

**Data model:** represent each as an *activation-type resource* with criteria plus a live `active_until` flag. Ingest triggers from City and Longmont news/GovDelivery, and optionally the NWS API for Boulder forecasts, to pre-warn ("Critical weather likely Thursday — arrive at All Roads before 7 PM").

**Other seasonal and temporary conditions:**

- **Policy seasonality.** All Roads' 10-day non-local stay limit runs from **May 4** and pauses from **about Nov 1** for winter. The answer to "can I stay?" depends on the date.
- **Heat.** Boulder has **no formal cooling-center activation**. Boulder County Public Health advises using libraries and rec centers during advisories (July 2026). Denver opens all rec centers on NWS heat advisories, but no Boulder equivalent was found. Model as advisory-linked guidance pointing to library hours.
- **Seasonal schedules.** Food Not Bombs (4 PM vs 3 PM); LEAP (Nov–Apr); park restrooms and water fountains (BFF already notes this).
- **Holiday closures.** Harvest of Hope Nov 26–28; EFAA Nov 26–27 and every **first Wednesday**; all libraries Fri Nov 20, 2026. Closure banners live in pop-ups and homepage notices, so scrape for "closed" keywords.
- **Pop-ups and relocations.** Community Court and Deacon's Closet moved (Jul 2026). FriendShip was paused over a county permit. The Source reopened in 2026. Community Table Kitchen closed (Aug 2026). Every record needs `status` (active / paused / closed / moved) and `effective_from/to`.
- **Enforcement context.**
  - The city's camping ban covers sleeping with "any cover or protection from the elements other than clothing." It was upheld by the Colorado Court of Appeals on 2026-05-14 in *Feet Forward v. City of Boulder*. The plaintiffs may petition the Colorado Supreme Court.
  - Ticketing rose in 2025–26, including 2 AM move-alongs. The city has also re-emphasized the Civic Area and Boulder Creek.
  - The 2025 Clutch Consulting report recommended moving food distribution from parks to All Roads; not implemented as of July 2026.
  - **Field tool implications:**
    - A "police/HOT present" field (BFF already has one) is high-value.
    - Community Court (ticket dismissal, voluntary, "will NOT be arrested") and the **belongings-retrieval hotline** should be suggested proactively after a sweep.
    - Never present meal locations in parks as guaranteed.

---

## 5. Lessons from comparable tools

| Tool | What it is | Lesson for BFF |
|---|---|---|
| **YourPeer / Streetlives (NYC)** | Mobile-first directory co-designed with unhoused youth; over 2,500 services. Information is "validated by our information specialists who all have lived experience"; Streetlives prioritizes hiring peers | **Peer validation is the freshness mechanism**, not scraping alone. Show "last validated by a peer" on each item. BFF's peer model is the same thing. Make it a first-class field (`verified_by`, `verified_at`) |
| **Link-SF (Zendesk + St. Anthony's, 2014)** | Mobile web app: open hours, phone, map directions; built because smartphones were spreading on the street. Traffic later dwindled (about 95 monthly visitors per one profile) | Simple "**open now / near me**" filters win. But a corporate-built tool without an ongoing data-maintenance owner decays. Ownership of updates matters more than the app |
| **SF Service Guide / AskDarcel (ShelterTech)** | Open-source Rails + React; public API; **Open Referral HSDS** data. Volunteers plus people with lived experience verify at "datathons." Case managers can build shareable custom resource guides | Adopt **HSDS 3.x** field names (`service.assured_date`, `assurer_email`, `schedule.valid_from/valid_to`, `eligibility_description`, `alert`) so BFF data can interoperate with 211 and county data. The **custom printable guide** pattern matches BFF's "print a support plan" |
| **Rose City Resource (Street Roots, Portland)** | Free pocket-size printed guide, two editions a year, 200,000 printed annually. **Online version discontinued April 2025** | **Print still dominates street use.** Plan for a printable one-page plan with an "info as of" date and a phone to verify. Even well-funded projects struggle to keep web data current, so a narrow, maintained scope beats breadth |
| **StreetLink (England/Wales)** | Public "alert" about rough sleepers to outreach teams. Criticized because the public, not the person, initiates contact. One reported ~9% connection rate (**UNVERIFIED**). Separate scandal: St Mungo's (StreetLink co-manager) shared migrant rough-sleeper data with the Home Office without consent. App retired Sept 2023 | **Consent and data minimization.** Never build "report a person" features. Don't store identifiable needs data without explicit consent. Treat immigration status and police-adjacent services as risks. Generate the support plan client-side or ephemerally |
| **All Roads street sheet / county navigation maps (local)** | Dense two-page PDF plus decision-tree flowcharts ("Do you have a place to sleep tonight?") | A **decision-tree entry** (sleep tonight? kids? pregnant? under 21? DV?) is already familiar to Boulder providers. Mirror the county map's branching for triage before free-text matching |

**Field-practice and trauma-informed takeaways for the matcher and printout:**

1. **Lead with what's open now and tonight**, then this week. Always show the time since the last check and a phone to confirm.
2. **Say the barrier out loud.** Show requirements plainly: ID, proof of residency (Community Food Share, EFAA food bank), CE required, sobriety or testing (Ready to Work), name collected or alias OK, pets, police presence, religious setting. BFF's fields (`rules`, `police`, `petAccess`) already do this better than any comparable tool.
3. **Don't over-promise.** Use "may," "subject to availability," and "beds not guaranteed," as the city and All Roads do. BFF's existing "do not promise" notes are good practice.
4. **Language parity.** All county and All Roads sheets are English and Spanish, so the printed plan should be too.
5. **Person-led wording.** Accept needs in the person's own words. Never prescribe religious practice (BFF note on r024). Offer alternatives without disparaging providers (BFF note on r032).
6. **Minimal data.** No accounts, no names on the plan unless the person wants them. Don't store the conversation by default.
7. **Conflicts are information.** When sources disagree (CE hours), print "call first" instead of a false-precise time.

---

## 6. Sources

**Boulder official (city, county, Longmont)**
- City "Where to Get Help": https://bouldercolorado.gov/services/homelessness-services
- City "Homelessness in Boulder" guide: https://bouldercolorado.gov/guide/homelessness-boulder
- City BHCR: https://bouldercolorado.gov/services/behavioral-health-crisis-response
- City Extreme Weather Shelter news: https://bouldercolorado.gov/news/city-and-partners-open-extreme-weather-shelter
- County Homeless Services: https://bouldercounty.gov/departments/community-services/homeless/homeless-services/
- County 2026 Boulder Housing Navigation Map: https://assets.bouldercounty.gov/wp-content/uploads/2026/04/2026-boulder-housing-navigation-maps-english-and-spanish-accessible.pdf
- County 2026 East County, Northern Mountains and Southern Mountains maps: https://assets.bouldercounty.gov/wp-content/uploads/2026/04/ (files named `2026-*-housing-navigation-map-*.pdf`)
- County Community Connections Guide 2024-25: https://assets.bouldercounty.gov/wp-content/uploads/2024/11/community-connections-resourceguide-2024-25-english.pdf
- The Works Program: https://bouldercounty.gov/families/disease/the-works-program/
- County heat advisory (Jul 2026): https://bouldercounty.gov/news/boulder-county-public-health-urges-community-to-take-precautions-during-heat-advisory/
- Longmont resources: https://longmontcolorado.gov/human-services/resources-for-people-experiencing-homelessness/
- Longmont severe-weather notices: https://longmontcolorado.gov/news/severe-weather-shelter-information-jan-20-2026/ ; https://longmontcolorado.gov/news/severe-weather-shelter-information-jan-8-10-2026/

**Providers**
- All Roads: https://www.allroadsboco.org/ ; Get Help: https://www.allroadsboco.org/get-help ; Aug 2026 Resource Guide: https://allroadsboco.org/wp-content/uploads/2026/10/August-2026-Resource-Guide-ENG-1.pdf (mirror: https://ctycms.com/co-boulder/docs/august-2026-resource-guide-eng.pdf) ; WP media API: https://www.allroadsboco.org/wp-json/wp/v2/media?search=resource
- Bridge House: https://boulderbridgehouse.org/about/hours-location/ ; operational update (Jul 22, 2026): https://boulderbridgehouse.org/bridge-house-operational-update/ ; https://boulderbridgehouse.org/resources/get-help-now/
- EFAA: https://efaa.org/
- Harvest of Hope: https://hopepantry.org/
- Community Food Share: https://communityfoodshare.org/get-food/
- TGTHR: https://www.tgthr.org/
- Haven Ridge: https://havenridgeboulder.org/
- HOPE for Longmont: https://hopeforlongmont.org/ ; https://hopeforlongmont.org/programs
- Recovery Café: https://www.recoverycafelongmont.org/ ; https://www.recoverycafelongmont.org/boulder/
- BCH Counseling Center: https://bch.org/locations/bch-counseling-center
- WellMind Connection: https://wellmindconnection.org/
- Clinica / MHP merger: https://mhpcolorado.org/blog/clinica-mhp-announce-merger ; https://coloradosun.com/2024/06/14/clinica-merger-mental-health-partners/
- Boulder Public Library locations: https://boulderlibrary.org/locations/ ; LibGuide: https://research.boulderlibrary.org/community-help/housing-food
- Downtown Boulder Partnership: https://boulderdowntown.com/about/homelessness-resources
- St. Benedict (2025 diocesan report): https://episcopalcolorado.org/wp-content/uploads/2025/09/St.-Benedict-Health-and-Healing-Ministry-Report-for-the-138th-Annual-Convention-of-the-Diocese-of-Colorado_2025.pdf

**News and context**
- All Roads rebrand (Jul 2024): https://boulderreportinglab.org/2024/07/16/boulders-largest-homeless-shelter-rebrands-emphasizing-housing-over-sheltering/
- All Roads local-ties limit (Apr 2026): https://boulderreportinglab.org/2026/04/14/boulders-main-homeless-shelter-will-limit-stays-for-people-without-local-ties/
- Services relocation and enforcement (Jul 2026): https://boulderreportinglab.org/2026/07/09/boulder-relocates-homelessness-services-amid-broader-push-to-curb-outdoor-sleeping-downtown/
- Appeals ruling (May 2026): https://boulderreportinglab.org/2026/05/19/colorado-appeals-court-sides-with-boulder-in-camping-ban-challenge/ ; https://www.coloradopolitics.com/2026/05/14/municipal-camping-bans-do-not-violate-colorado-constitution-says-appeals-court/
- Creek enforcement (Apr 2025): https://boulderreportinglab.org/2025/04/27/everything-is-pink-tags-boulder-steps-up-camping-ban-enforcement-along-boulder-creek/
- Shelter turnaways and winter capacity (Dec 2025): https://boulderreportinglab.org/2025/12/14/shelter-turnaways-at-boulders-all-roads-unusually-low-after-summer-of-high-demand/
- Library resource connector (Jul 2024): https://boulderreportinglab.org/2024/07/11/in-a-first-boulder-public-library-launches-program-to-connect-homeless-people-to-services/

**Comparable tools and standards**
- Streetlives / YourPeer: https://opencollective.com/streetlives/updates/streetlives-soft-launch-of-yourpeer ; https://www.einpresswire.com/article_print/762320537/streetlives-launches-yourpeer-platform
- Link-SF: https://zendesk.com/blog/link-sf-gets-much-needed-update ; https://github.com/zendesk/linksf
- SF Service Guide / ShelterTech: https://help.sfserviceguide.org/ ; https://medium.com/shelter-tech/building-technology-and-community-to-address-homelessness-in-san-francisco-673133b42d90
- Rose City Resource: https://www.streetroots.org/rose-city-resource/
- StreetLink critique and data-sharing: https://museumofhomelessness.org/news/the-problem-with-streetlink ; https://insidehousing.co.uk/news/st-mungos-apologises-for-sharing-information-on-migrant-rough-sleepers-with-home-office-64050 ; https://www.crisis.org.uk/ending-homelessness/homelessness-knowledge-hub/services-and-interventions/evaluation-of-the-streetlink-project-2018/
- Open Referral HSDS 3.0 schema: https://openreferral.readthedocs.io/en/v3.0/hsds/schema_reference.html
