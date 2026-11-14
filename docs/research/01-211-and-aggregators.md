# 01 — 211 Colorado and other service-directory aggregators as ingestion sources

Researched 2026-11-14. Scope: 211 Colorado, the 211 National Data Platform (NDP), findhelp, Boulder County directories and data, homelessness-system sources (Coordinated Entry, HMIS), and national open datasets usable for Boulder.
Every claim cites a URL. **UNVERIFIED** marks anything I could not confirm directly.

---

## 1. Summary and recommendation

**Bottom line:** No public, unauthenticated, licensed feed of 211 Colorado data exists. 211-quality data for Boulder can legally reach our DB by one of two routes, and both need someone's permission:

1. **Data-sharing agreement with Mile High United Way (MHUW), the 211 Colorado data owner, plus a 211 NDP API key.** 211 Colorado already pushes its database into the national 211 NDP ([register.211.org integrations overview](https://register.211.org/Home/IntegrationsOverview)). The NDP Export API returns full organization, service, and location records with an `updatedAfterUTC` delta parameter and a `deletedOrganizations` array. Our automated ingest/refresh requirement needs exactly that. Production keys require a signed data-sharing agreement or MOU with the owning 211, and UWW approval. Expect weeks, not days.
2. **Direct ask to MHUW for a CSV/API extract scoped to Boulder County.** Their own search app imports from `resources.csv`-style files (see §2.1). For a small nonprofit partner, this may be faster than the NDP process. **UNVERIFIED** whether they will agree.

**What to do this week (realistic):**

| Step | Effort | Risk | Notes |
|---|---|---|---|
| A. Email MHUW 211 database team (`211database@unitedwaydenver.org`, listed in their site config) asking for (a) permission to use Boulder County 211 records in a free, printable outreach tool, with attribution, and (b) whether they prefer an NDP Export API product or a periodic CSV. | 1–2 h to write | Low | Response time is UNVERIFIED. Ask also about the "claim a resource" flow so BFF can push corrections back. |
| B. Sign up at [apiportal.211.org](https://apiportal.211.org/) and request a key via the [211 API Request Form](https://app.smartsheet.com/b/form/c334690c49cd477fb27c7c0176c52d1d). Build the ingester against the documented Export/Search schemas. | 2–4 h | Low | The Trial product is dev/test-only, 10 calls/min, 1,000/day, 10 results max, and production use is "strictly prohibited". Build the code path now, but data use must wait for permission. |
| C. **Seed now from sources that are openly reusable or authoritative public pages:** SAMHSA FindTreatment.gov API (public, no key, verified working for Boulder), HRSA health-center site downloads, and City of Boulder / Boulder County homelessness pages (Coordinated Entry, All Roads Shelter, day services). Volunteers hand-verify about 50–100 core street-outreach services. | 1–3 days | Low | Gives a usable printable plan this week without 211 data. Record `source_url` and `verified_at` on every row. |
| D. Do **not** scrape findhelp / BoCo Findhelp. | — | High (legal) | Its ToS explicitly prohibits screen-scraping, storing, compiling, and derivative works (§2.3). |
| E. Do **not** scrape search.211colorado.org without written permission. | — | Medium | Its robots.txt allows everything and no ToS page was found. But the data is owned by MHUW, and the NDP terms treat external use as needing the owning 211's permission. Scraping would also poison the partnership ask in step A. It is technically feasible (Rails JSON endpoints), but only use it if MHUW says yes in writing. |

**Design implication for our DB:** model records on **Open Referral HSDS** (organization → service → location → service_at_location, plus `regular_schedule`, `phone`, `eligibility`). The 211 NDP Query API is explicitly "standards-based protocols published by Open Referral" (§2.2), and the NDP transforms all 211 data "to align closely with the Open Referral data specification". Keep a per-record `source`, `source_record_id`, `license/permission`, `last_source_update`, and `last_volunteer_verified` so pruning and fine-tuning survive automated refreshes.

---

## 2. Findings per source

### 2.1 211 Colorado (https://www.211colorado.org/)

**Who runs it.** A statewide network "provided by seven non-profit organizations" (Mile High United Way, Pikes Peak United Way, United Way of Larimer County, United Way of Weld County, Hilltop, SRDA, Team Up), per the [211colorado.org home page](https://www.211colorado.org/). The database is administered by **Mile High United Way (MHUW, unitedwaydenver.org)**: the search app's org config names the API contact as "Mile High United Way", and its data inbox is `211database@unitedwaydenver.org` (embedded config in [search.211colorado.org](https://search.211colorado.org/) page source, fetched 2026-11-14).

**Platform/vendor (verified from page source and HTTP headers).**
- The public search at **https://search.211colorado.org** is a **custom Ruby on Rails + Backbone.js app hosted on Heroku**, not iCarol, WellSky/RTM, VisionLink/Connect211, or findhelp. Evidence: the `server: Heroku` and `via: heroku-router` headers, the session cookie `_united-way-211_session`, and a JS namespace `UW211`. The org config lists `staffEmailDomains: ["unitedwaydenver.org","mojotech.com"]`, which suggests the app was built and maintained by the agency **MojoTech** (an inference, **UNVERIFIED** beyond that config line).
- The config lists bulk import file names (`resources.csv`, `taxonomies.csv`, `FolksonomyTermsForCO11222019v3.csv`, `CO_service_areas11272019.csv`, `ZipCodesForCO11262019.csv`, `YTaxCodes.csv`). So records are loaded from CSV extracts of an upstream resource-management system and coded with the **211 HSIS / AIRS taxonomy** ("Y" taxonomy codes are AIRS target-population codes). The upstream RMS vendor is **UNVERIFIED**.
- 211 Colorado contributes to the national platform through "custom NDP integrations with their own custom APIs" ([register.211.org/Home/IntegrationsOverview](https://register.211.org/Home/IntegrationsOverview)).
- The config also declares an API host `api.211colorado.org` titled "2-1-1 MH Search API". The hostname **did not resolve or respond** from our environment on 2026-11-14 (proxy CONNECT 502). Treat it as non-public or defunct (**UNVERIFIED**).
- The search front end calls internal JSON routes (`/search`, `/taxonomies`, `/resource_lists`, `/print`, `/share/resource`, …) found in the compiled JS bundle. A plain `Accept: application/json` request to `/search` returned **HTTP 406**, so the JSON API is undocumented and not intended for third parties. I did not probe further.

**Public API / export / widget.** No public API, export, embeddable widget, or bulk-download offer was found on 211colorado.org or search.211colorado.org. The only data-related public links are the agency submission form ([milehighunitedway.my.site.com/AgencySubmission](https://milehighunitedway.my.site.com/AgencySubmission/s/), a Salesforce Experience Cloud site that `www.211colorado.org/update-database/` redirects to) and a Database Inclusion Policy PDF linked from the home page. That PDF ([link](https://211colorado.org/wp-content/uploads/2020/12/2-1-1-Colorado-Database-Inclusion-Policy-04.16.2020.pdf)) returned **404** on 2026-11-14.

**Terms of use.** No terms-of-use page was found. `search.211colorado.org/terms` and `/privacy` return 404. www.211colorado.org pages are behind bot protection (HTTP 403 to curl). The "Creating a Resource List" help page carries only a disclaimer: "2-1-1 Colorado assumes no responsibility for any errors appearing, nor for the use of the information provided" ([211colorado.org/creating-a-resource-list](https://www.211colorado.org/creating-a-resource-list/)). Silence is **not** a license (see §3).

**Useful product facts for BFF.**
- 211 Colorado users can already save resource lists and **print, email, text, or link** them ([creating-a-resource-list](https://www.211colorado.org/creating-a-resource-list/)). This is a fallback for volunteers when our DB has gaps.
- Boulder County's 2026 directory flyer says 211 services are "updated daily" ([Boulder County 2026 resource directories PDF](https://assets.bouldercounty.gov/wp-content/uploads/2026/04/2026-community-resource-guides-english-and-spanish-accessible.pdf)). The update cadence is not stated by 211 itself (**UNVERIFIED**).
- Scale: more than 6,500 services from more than 2,500 agencies statewide (figures vary by document; see [211 Colorado one-pager](https://www.211colorado.org/wp-content/uploads/2022/01/22_Colorado2-1-1_One_Pager.pdf)). Boulder-only counts are **UNVERIFIED**.
- robots.txt on search.211colorado.org disallows nothing ([robots.txt](https://search.211colorado.org/robots.txt)). That is a technical fact, not permission.

### 2.2 211 National Data Platform (United Way Worldwide) — apiportal.211.org

**What it is.** The NDP is UWW's Azure API Management–hosted platform that aggregates local 211 resource databases ([apiportal.211.org](https://apiportal.211.org/); [register.211.org FAQ](https://register.211.org/Home/FAQs)). 211 Colorado is a contributor ([IntegrationsOverview](https://register.211.org/Home/IntegrationsOverview)).

**APIs (verified from the portal's public developer metadata at `https://apiportal.211.org/developer/apis?api-version=2022-04-01-preview` and its `/operations` sub-resources, 2026-11-14).** Anonymous visitors see V1 APIs now labelled "(deprecated)". The portal home page announces V2 APIs "in preview": Search V2, Export V2, Query V2, Suggest V2, Filter V2, EPIC V2 ([apiportal.211.org](https://apiportal.211.org/)). V2 operation details are not publicly visible (**UNVERIFIED**).

- **Auth:** subscription key in header **`Api-Key`** or query param `api-key` (from API metadata `subscriptionKeyParameterNames`). The gateway is `https://api.211.org/`. An unauthenticated `GET https://api.211.org/search/v1/api/Filters/DataOwners` returned `401 Access denied due to missing subscription key`, which confirms the path exists.
- **Search (V1, path `search`)**, verified operations: `GET /api/Search/Keyword?Keyword=…` (location optional; filters for distance, service area, page size and number), `GET /api/Search/Guided?TaxonomyCode=…`, `GET /api/ServiceAtLocation?idServiceAtLocation=…` (plus `/api/ServiceAtLocation/v2`), `GET /api/Service`, `GET /api/Location`, `GET /api/ServicesAtLocation`, `GET /api/LocationsForService`, and filters `GET /api/Filters/DataOwners | ServiceAreas | ServiceLocations | StatesProvinces | Topics | Subtopics | TopicOwners | TopicsSubtopics`. Topics are AIRS Level 1 and subtopics AIRS Level 2 taxonomy terms.
- **Export (V1, path `export`)**: `GET /api/Organizations` (bulk export; params `pageSize`, `pageIndex`, `updatedAfterUTC`; response includes `totalCount` and a `deletedOrganizations` array for delta sync) and `GET /api/Organizations/{id}`. The API description says it filters "on last updated date, page size, page number, data owner and state location". **This is the right shape for our automated refresh job.**
- **Query (V1, path `resources`)**: described as using "open, standards-based protocols published by Open Referral". Its HSDS-style routes include `/api/Services`, `/api/Services/complete`, `/api/Locations/{id}/regular-schedule`, `/api/Services/{id}/required-document`, `/api/Services/{id}/service-area`, `/api/Organizations/complete`, `/api/Services/{id}/holiday-schedule`, `/api/Services/{id}/languages`, and more. These map almost one-to-one to HSDS tables.
- **HSDS:** the NDP says all 211 data "is transformed to align closely with the Open Referral data specification" ([register.211.org](https://register.211.org/Home/WellSky) / search summary of NDP pages). Exact HSDS version conformance is **UNVERIFIED**.

**Access, cost, limits.**
- The **Trial product** is free with approval required. It is "intended and may only be used for development and testing purposes. All other uses are strictly prohibited!" Limits are 10 calls/min, 1,000/day, first page only, max 10 results, and active records only (portal product metadata, `.../developer/products`).
- **Production access:** submit the [211 API Request Form](https://app.smartsheet.com/b/form/c334690c49cd477fb27c7c0176c52d1d), which "initiates the process of creating an API product" ([FAQ](https://register.211.org/Home/FAQs)). The form reportedly requires a signed data-sharing agreement or MOU with the data owner (search-result summary; the Smartsheet form body could not be rendered, **UNVERIFIED** in detail). API products can be scoped by data contributor or geography ([FAQ](https://register.211.org/Home/FAQs)).
- **Cost:** sharing and internal 211 use are free. When a 211 licenses its data to a third party via the NDP, UWW charges **5% of the contract** ([FAQ](https://register.211.org/Home/FAQs); [NDP Agreement, Fees section](https://register.211.org/files/National%20211%20Data%20Platform%20Agreement.pdf)). A free license from MHUW would therefore incur no UWW fee, though whether MHUW charges is **UNVERIFIED**.

### 2.3 findhelp (formerly Aunt Bertha), including BoCo Findhelp

- **BoCo Findhelp** (https://boco.findhelp.com/) launched in May 2025. It was built by Family Connects, the Family Resource Network, and WellMind Connection, and organizations can claim and update their own listings ([Boulder County news, 2025-05-21](https://bouldercounty.gov/news/new-website-helps-people-find-local-resources/)). The county promotes it as the primary local directory, and the old Boulder County Connect portal closed 2025-08-04 (search summary of [bouldercounty.gov navigation resources](https://bouldercounty.gov/departments/housing-and-human-services/navigation-resources/)).
- **API:** no public developer API or partner sign-up was found. The ToS states users have "not been granted any license to use Aunt Bertha's proprietary platform or Aunt Bertha API (such use would require a separate paid subscription agreement)" ([findhelp.org/legal/terms](https://www.findhelp.org/legal/terms), §3). Findhelp marketing materials mention API/SQL data-warehouse access for paying customers ([product sheet PDF](https://uploads4.craft.co/uploads/operating_source/document/949874/30576474204b8b4b.pdf)), **UNVERIFIED** details.
- **Reuse is prohibited without written permission.** The ToS forbids copying "any of the Materials in any form, regardless of technique (e.g., screen-scraping, downloading…)", and forbids anyone to "host, save, preserve, memorialize, aggregate, collect, compile, or otherwise retain or store any of the Materials". It also bars creating derivative products and using "data mining, robots, or similar data gathering or extraction methods" ([findhelp.org/legal/terms](https://www.findhelp.org/legal/terms), §§3, 5, 11). **Conclusion: not an ingestion source.** Link out to it at most. An alternative is to ask local agencies, who own their own listing content, to share it with us directly.

### 2.4 Boulder County Community Data Dashboard

Confirmed: **aggregate statistics only, not service listings.** It reports 2025 counts of individuals and households receiving SNAP, Colorado Works/TANF and Adult Financial, and Medicaid, using cumulative counting. No provider listings, download, or API were found ([bouldercounty.gov community-data-dashboard](https://bouldercounty.gov/departments/human-services/community-data-dashboard/)). It is useful only for context and grant writing, not for matching.

The county also has a **Homeless Solutions dashboard** with system outcomes, also aggregate ([homeless dashboard](https://bouldercounty.gov/departments/community-services/homeless/project-recovery/homeless-dashboard/)).

### 2.5 Boulder County Housing & Human Services and its directory-of-directories

The April 2026 "Navigating Boulder County — Community Resource Directories" flyer (EN/ES) is a **directory of directories**, not a service list. It lists BoCo Findhelp, 211Colorado.org, Colorado PEAK, Peak to Peak Get Help Resource Guide, BoulderCountyHelp.org, BVSD Family Resource Guide, the Early Childhood Council, the Housing Helpline (303-441-1206, housinghelpline@bouldercounty.gov), A&I Avenues, Clinica, and WellMind Connection (303-441-1300) ([PDF, updated 4/26](https://assets.bouldercounty.gov/wp-content/uploads/2026/04/2026-community-resource-guides-english-and-spanish-accessible.pdf)). Its entries are good seed rows for "navigation" services.

- **BoulderCountyHelp.org** redirects to **Network of Care** (aging and disability resource guide, https://aging.networkofcare.org/boulder-co/), verified by HTTP redirect. Network of Care is a proprietary vendor platform (Trilogy Integrated Resources, **UNVERIFIED**). Its licensing is **UNVERIFIED**, so treat it as no-reuse without permission.
- `boco.org/CommunityConnections` now redirects to a generic county "connect with us" page (verified redirect), so it is not a dataset.
- County housing-navigation maps (PDF, April 2026) list Coordinated Entry phones and hours by region ([e.g., east county map](https://assets.bouldercounty.gov/wp-content/uploads/2026/04/2026-east-county-housing-navigation-map-english-and-spanish-accessible.pdf)). These are authoritative but manual; PDF parsing could be automated with change detection.

### 2.6 Homeless Solutions for Boulder County (HSBC) / Coordinated Entry (CE)

- All single homeless adults must go through CE to receive Boulder County, City of Boulder, or City of Longmont services ([Boulder County homeless services](https://bouldercounty.gov/departments/community-services/homeless/homeless-services/)).
- **Current City of Boulder page** (no last-updated date shown; © 2026): CE phone **303-579-4404**, in person at **All Roads Shelter, 4869 N. Broadway, Boulder 80304, Mon–Fri 9am–3pm**. The Day Services Center there runs Mon–Fri 9am–2pm, with lunch at 11:45am, showers, laundry, phones, and charging. Critical Weather Shelter triggers are listed. Also listed are EFAA (303-442-3042), SPAN 24-h hotline (303-444-2424), and Haven Ridge (303-447-9602) ([bouldercolorado.gov/services/homelessness-services](https://bouldercolorado.gov/services/homelessness-services)).
- Longmont CE: 720-453-6096. Hours differ between sources (Jan 2026 vs Apr 2026 county maps), **so volunteer verification is required** ([search results incl. county maps](https://assets.bouldercounty.gov/wp-content/uploads/2026/04/2026-east-county-housing-navigation-map-english-and-spanish-accessible.pdf)).
- **Note:** "Boulder Shelter for the Homeless" appears to now operate as **All Roads** (allroadsboco.org) per the City page. Older sources use the old name, so dedupe on address.
- There is **no machine-readable feed**. These are the highest-value records for BFF's population, so seed them manually and re-check them with page-change monitoring (hash the page HTML weekly).

### 2.7 HMIS / Metro Denver Homeless Initiative (MDHI), OneHome

Boulder County is in the MDHI Continuum of Care. MDHI is the HMIS Lead, and **OneHome** is the regional coordinated-entry system ([MDHI HMIS page](https://oboe-gopher-yd33.squarespace.com/hmis); [Boulder County homeless dashboard](https://bouldercounty.gov/departments/community-services/homeless/project-recovery/homeless-dashboard/)). HMIS contains **client-level PII and program enrollments, not a public service directory**. I found no public HMIS-derived directory. Not an ingestion source; possibly a future partnership for a list of HMIS-participating programs (**UNVERIFIED** whether MDHI publishes one). Contact: hmishelp@mdhi.org.

### 2.8 Colorado PEAK

https://www.colorado.gov/PEAK redirects to a Salesforce site (peak.my.site.com), verified. It is the state **benefits application portal** (SNAP, Medicaid, cash, etc.), **not a service directory**. Use it as a single "apply for benefits" record and link in support plans.

### 2.9 Colorado Coalition for the Homeless (CCH)

CCH is Denver-based. I found no evidence of a public service directory or Boulder County programs ([search summary](https://urbanpeak.org/partners/orgs/colorado-coalition-for-the-homeless)). It is not a Boulder ingestion source. Boulder-specific CCH programs, if any, are **UNVERIFIED**.

### 2.10 National open sources usable today (no permission needed)

- **SAMHSA FindTreatment.gov API**: public JSON, no key. Endpoint `https://findtreatment.gov/locator/exportsAsJson/v2?sAddr="lat,lng"&limitType=2&limitValue=<meters>&pageSize=&page=` per the official [Developer Guide v1.12, Aug 17 2026](https://findtreatment.gov/assets/FindTreatment-Developer-Guide.pdf). Verified 2026-11-14: a query at Boulder (40.0150,-105.2705), 8 km radius, returned `recordCount: 14` facilities with name, address, phone, website, lat/long, and service codes. It gives mental health and SUD treatment coverage. As U.S. federal government data it is generally public domain, though the explicit license statement is **UNVERIFIED**. Hours are not included.
- **HRSA data downloads**: Health Center Service Delivery and Look-Alike Sites ([data.hrsa.gov/data/download](https://data.hrsa.gov/data/download)) give FQHC sites such as Clinica and Salud with addresses and phones. Verified the page exists; field list **UNVERIFIED**.
- **Open Referral HSDS spec**, to use as our schema: [openreferral.readthedocs.io](https://openreferral.readthedocs.io/en/latest/).

---

## 3. Licensing

| Source | Store/cache | Enrich | Redistribute (print plans) | Attribution | Basis |
|---|---|---|---|---|---|
| 211 Colorado (direct) | Only with MHUW permission | Only with permission | Only with permission. Printing for individual clients is likely the use they'd approve, but get it in writing | Expect to be required ("Source: 2-1-1 Colorado / Mile High United Way") | Data owned by the 211 provider ([NDP Agreement](https://register.211.org/files/National%20211%20Data%20Platform%20Agreement.pdf) recitals: "Agent or the relevant Provider will continue to own… the data"). No public license found. |
| 211 NDP API | Trial: dev/test only. Production: per the API product agreement | Per agreement | Per agreement | Per agreement | Trial terms: "Any use of this data for production, operational, commercial, or other external purposes requires the prior permission of each participating 211 center whose data is being accessed" (portal product terms). NDP Agreement §4.1.2: UWW discloses data to third parties only "with the express written permission of the Platform Participant that provided the data". §7.3: third-party licensees must accept substantially the same data-use and security terms and indemnify UWW and the 211s. |
| findhelp / BoCo Findhelp | **No** | **No** | **No** | n/a | ToS §§3, 5, 11 ([findhelp.org/legal/terms](https://www.findhelp.org/legal/terms)) |
| Network of Care (BoulderCountyHelp.org) | Assume no | Assume no | Assume no | — | **UNVERIFIED**; vendor ToS not reviewed |
| City of Boulder / Boulder County web pages and PDFs | Facts (addresses, hours, phones) are not copyrightable in the U.S.; re-keying facts with a source link is low risk | Yes | Yes | Good practice: cite source URL and date | Government public information. Formal open-data license is **UNVERIFIED** |
| SAMHSA FindTreatment.gov, HRSA | Yes | Yes | Yes | Cite SAMHSA/HRSA | Federal public data. Explicit license statement **UNVERIFIED** |
| Agency-supplied data (direct from providers) | Yes, with consent | Yes | Yes | Per agency | Ask each agency to agree when onboarding |

Practical rule: store a `license` / `permission_ref` field per source. The print template should render a footer with source attributions for any record whose license requires it.

---

## 4. Open questions for BFF

1. Does BFF (or a board member) already have a relationship with Mile High United Way, Boulder County Housing & Human Services, or the Family Resource Network? A warm intro materially changes the timeline for the 211 data ask.
2. Is BFF willing to sign a data-sharing agreement with indemnification and security obligations (NDP Agreement §7.3 style)? Who can sign?
3. Should the app *link out* to 211 Colorado and BoCo Findhelp as a fallback search, rather than ingesting them? This needs zero permission and could ship now.
4. Will BFF push corrections back upstream (211 "claim a resource" / agency submission form, findhelp claims)? 211 may value that reciprocity in a partnership ask.
5. Does BFF want the app to be usable directly by unhoused people without accounts? That affects whether 211 would treat our app as "public redistribution" vs. "volunteer tool". Clarify in the ask.
6. Geographic scope: Boulder County only, or also Broomfield and Longmont-adjacent Weld? This determines the API product geography filter to request.
7. Who on the volunteer team owns weekly verification of the ~20 highest-traffic street-outreach services (CE, All Roads, day services, food, showers)? No aggregator will keep these as fresh as BFF needs.

---

## 5. Sources

- 211 Colorado home: https://www.211colorado.org/
- 211 Colorado search app (page source, headers, robots): https://search.211colorado.org/ , https://search.211colorado.org/robots.txt
- 211 Colorado "Creating a Resource List": https://www.211colorado.org/creating-a-resource-list/
- 211 Colorado agency submission (redirect target of /update-database/): https://milehighunitedway.my.site.com/AgencySubmission/s/
- 211 Colorado Database Inclusion Policy (404 on 2026-11-14): https://211colorado.org/wp-content/uploads/2020/12/2-1-1-Colorado-Database-Inclusion-Policy-04.16.2020.pdf
- 211 Colorado one-pager: https://www.211colorado.org/wp-content/uploads/2022/01/22_Colorado2-1-1_One_Pager.pdf
- 211 NDP developer portal: https://apiportal.211.org/
- 211 NDP portal API metadata (public JSON): https://apiportal.211.org/developer/apis?api-version=2022-04-01-preview , https://apiportal.211.org/developer/products?api-version=2022-04-01-preview
- 211 NDP gateway (401 without key): https://api.211.org/search/v1/api/Filters/DataOwners
- 211 NDP FAQ: https://register.211.org/Home/FAQs
- 211 NDP Integrations overview: https://register.211.org/Home/IntegrationsOverview
- 211 NDP WellSky integration page: https://register.211.org/Home/WellSky
- National 211 Data Platform Agreement (PDF): https://register.211.org/files/National%20211%20Data%20Platform%20Agreement.pdf
- 211 API Request Form: https://app.smartsheet.com/b/form/c334690c49cd477fb27c7c0176c52d1d
- findhelp Terms of Service: https://www.findhelp.org/legal/terms
- findhelp product sheet: https://uploads4.craft.co/uploads/operating_source/document/949874/30576474204b8b4b.pdf
- BoCo Findhelp launch: https://bouldercounty.gov/news/new-website-helps-people-find-local-resources/
- Boulder County navigation resources: https://bouldercounty.gov/departments/housing-and-human-services/navigation-resources/
- Boulder County Community Data Dashboard: https://bouldercounty.gov/departments/human-services/community-data-dashboard/
- Boulder County homeless dashboard: https://bouldercounty.gov/departments/community-services/homeless/project-recovery/homeless-dashboard/
- Boulder County homeless services: https://bouldercounty.gov/departments/community-services/homeless/homeless-services/
- Boulder County 2026 resource directories flyer: https://assets.bouldercounty.gov/wp-content/uploads/2026/04/2026-community-resource-guides-english-and-spanish-accessible.pdf
- Boulder County 2026 east county housing navigation map: https://assets.bouldercounty.gov/wp-content/uploads/2026/04/2026-east-county-housing-navigation-map-english-and-spanish-accessible.pdf
- City of Boulder homelessness services: https://bouldercolorado.gov/services/homelessness-services
- Network of Care (BoulderCountyHelp.org target): https://aging.networkofcare.org/boulder-co/
- MDHI HMIS: https://oboe-gopher-yd33.squarespace.com/hmis
- Colorado PEAK: https://www.colorado.gov/PEAK
- Colorado Coalition for the Homeless (summary): https://urbanpeak.org/partners/orgs/colorado-coalition-for-the-homeless
- SAMHSA FindTreatment.gov API guide: https://findtreatment.gov/assets/FindTreatment-Developer-Guide.pdf
- HRSA data downloads: https://data.hrsa.gov/data/download
- Open Referral HSDS: https://openreferral.readthedocs.io/en/latest/
