# 04 — Data Model, Taxonomy & Matching

*Research memo for the Boulder Feet Forward (BFF) resource app. Prepared 2026-11-14.*
*Scope: core schema (HSDS), taxonomies, non-AI matching, ingestion/enrichment pipeline, reusable open source.*
*Convention: claims I could not confirm from a primary source in this session are marked **UNVERIFIED**.*

---

## 1. Summary / recommendation

**Recommendations:**

1. **Use Open Referral HSDS 3.x as the core schema in Postgres, and keep the HSDS table and field names exactly.** Current release: v3.2.3 ([changelog](https://openreferral.readthedocs.io/en/latest/hsds/changelog.html)). Publish BFF's extensions as an **HSDS profile**: a set of JSON Merge Patch files, generated with `hsds_schema_tools` ([profiles doc](https://openreferral.readthedocs.io/en/latest/hsds/profiles.html)). Keep BFF-only concepts in separate `bff_*` side tables keyed by the HSDS id. Do not add columns to the HSDS tables themselves. This lets us serve a compliant HSDS API (`/`, `/services`, `/services/{id}` are the only required endpoints) and import or export other HSDS feeds with little code.
2. **Make the HSDS tables a published "golden record" built from field-level assertions, not the place where edits happen.** Every value from 211, city data, a provider website, an LLM, or a volunteer is stored as a `field_assertion` with its source, time, and confidence. A resolver picks the winning value per field. Locked human overrides always win. A source that later disagrees with a locked field opens a review item and does not overwrite the value. This one mechanism covers provenance, per-field source attribution, edits that survive re-ingestion, and change detection.
3. **Use a two-layer, open taxonomy, and do not build on 211HSIS (AIRS).**
   - **Layer A (needs):** a plain-language **needs lexicon** in English, Spanish, and street slang ("my tent got jacked", "no tengo dónde dormir", "need a charge").
   - **Layer B (services):** BFF's existing **72 service categories**. Each one already sits under one of the **Eight Dimensions** and one of three **tiers** (Immediate needs / Stabilization / Long-term stability).
   - **Crosswalks:** to Open Eligibility (CC BY-SA), Gravity Project SDOH domains (for healthcare interop), and, only under a license, 211HSIS codes for ingest mapping.
   - **Why not 211HSIS:** it is subscription-only, non-sublicensable, and has no published price ([211 LA subscription agreement](https://taxonomy-sandbox.211la.org/library/Subscription_Agreement.pdf)).
4. **Build matching with no AI dependency.** The pipeline is:
   1. Lexicon phrase matching.
   2. Postgres full-text search (`english` and `spanish` configs plus `unaccent`), with `pg_trgm` fuzzy matching as a fallback.
   3. Hard facet filters: open now, walkable, pets OK, no ID, no sobriety requirement.
   4. A transparent weighted ranking: need match, open now/soon, distance, BFF-preferred, verification recency, barrier fit.
   5. Situation cues route the user into BFF's existing **decision trees**: property taken, camping ticket, vital documents, disability, medical, housing, employment, mental health, SUD.

   An LLM is an optional front end that turns free text into the same structured query (need concepts + facets). It never replaces the deterministic path.
5. **Pipeline:** source connectors → raw immutable fetches → per-source normalization to HSDS-shaped records → entity resolution (rules plus a human-confirmed crosswalk) → enrichment (deterministic first, LLM optional, all output stored as *suggestions*) → review queue → publish (materialized HSDS + search index + offline JSON snapshot). Each category gets a verification cadence by risk. Staleness is computed and shown to users ("BFF checked 3 days ago").
6. **Reuse rather than adopt:**
   - **Use directly:** the Open Referral spec JSON schemas and OpenAPI, `hsds_schema_tools`, `hsds-profile-wizard`, `mock-hsds-api` (BSD-3), the ORUK API validator, and `dbt_icarol_to_hsds` (if Colorado 211 data arrives as an iCarol export).
   - **Study only:** YourPeer/Streetlives (MIT, Next.js, active; it uses the same "AI search behind a feature flag" pattern we want), AskDarcel (GPL-3.0: learn from it, do not copy code), and Ohana API (BSD-3, Rails 5.2, legacy).

### What BFF's current data tells us (from `reference/libby-mockup-index.html`, `BFF_DATA` v3.0)

- **Size:** 111 resources and **72 categories** (not ~60) across 8 dimensions × 3 tiers. "Outreach Workshops & Activities" appears under two dimensions (Intellectual and Emotional). "Pets" is used on resources but is **not in any dimension**. "Car Repair" and "Gas Money / Fuel Assistance" exist as categories but no resource uses them.
- **Category assignments:** about 2.6 categories per resource. BFF's own entry (r001) has 20, which shows that "an organization doing many things" must be split into several HSDS `service` rows.
- **Structured fields are sparse:**

  | Field | Filled on |
  |---|---|
  | `phone` | 24 / 111 |
  | `url` | 18 / 111 |
  | `rules` | 3 / 111 |
  | `eventDay` / `eventTime` | 18 / 111 |
  | `verified` | 0 / 111 |
  | `preferred` | 1 / 111 |
  | `police` | 18 / 111 (free text: "No", "Usually present", "No expected HOT presence…") |
  | `petAccess` | 21 / 111 (free text: "Yes", "Conditional", "TBD", "Pet-friendly per BFF experience") |

- **Most knowledge is free text.** `access` mixes hours, place directions, and intake. `notes` mixes public tips with **internal-only notes**, for example "Ask Andy permission before publishing his phone number". `status` is really a provenance/confidence label: "Field notes; verify details" (57), "BFF event field notes…" (18), "BFF firsthand" (15), "Needs resource research" (7), and so on.
- **Also present:** `gaps` (7 unmet-need items), `followups` (6 verification tasks with owner and status), `popups` (one-time events with expiry, stored in localStorage `bff_db_v3`), and 9 decision trees (`treesData`).

**Implications for the schema:**

- `notes` needs a public/internal visibility split.
- `status` becomes a provenance enum plus confidence.
- `police` and `petAccess` become controlled vocabularies, each with a free-text caveat.
- `access` and `eventDay`/`eventTime` must be parsed into structured schedules.
- `followups` and `gaps` become first-class workflow tables.

---

## 2. HSDS overview & extension plan

### 2.1 HSDS 3.x in brief

HSDS is Open Referral's exchange format for organizations, services, and locations. The specification is licensed CC BY-SA 4.0 ([Open Referral FAQ / initiative docs](https://openreferral.readthedocs.io/en/latest/initiative/)). The canonical schemas are JSON Schema 2020-12, and the API is described in OpenAPI 3.1. Repo: [github.com/openreferral/specification](https://github.com/openreferral/specification), active; the org page showed an update on 2026-10-29.

**Core entities** ([schema reference](https://docs.openreferral.org/en/latest/hsds/schema_reference.html)):

| Entity | Key fields (abridged) | Notes for BFF |
|---|---|---|
| `organization` | id (uuid), name, description, website, email, parent_organization_id, legal_status, `additional_websites` (3.1) | Provider (e.g., Bridge House, BCAP). BFF itself is an org. |
| `program` | id, organization_id, name | Optional grouping (e.g., Bridge House "Ready to Work"). |
| `service` | id, organization_id, program_id, name, description, url, email, **status** (active / inactive / defunct / temporarily closed), eligibility_description, minimum_age, maximum_age, fees_description, application_process, **assured_date**, last_modified, `capacities`, `additional_urls` (3.1) | The unit we match and rank. Each BFF "resource" splits into 1..n services. |
| `location` | id, **location_type** (physical / postal / virtual), name, description, transportation, latitude, longitude, external_identifier | Includes "southeast corner of Central Park" outreach spots, so it needs precise lat/lon plus description. |
| `service_at_location` | id, service_id, location_id, description | Where a service is delivered; carries its own schedules. Outreach events attach here. |
| `address` | location_id, address_1, city, state_province, postal_code, country, address_type | |
| `phone` | number, extension, type, description, languages; FK to org / service / location / contact / service_at_location | |
| `schedule` | see §2.2 | |
| `service_area` | service_id, name, extent, extent_type | "Boulder County residents only" etc. |
| `language` | service / location / phone, name, code | Spanish availability is a facet. |
| `accessibility` | location_id, description, details, url | Mobility access, from BFF follow-up "Resource-specific accessibility notes". |
| `cost_option`, `required_document`, `funding`, `contact`, `organization_identifier`, `service_capacity`, `unit`, `url` (3.1) | | `required_document` maps to "ID required". `service_capacity` (3.1) could carry shelter beds or meals available. |
| `taxonomy`, `taxonomy_term` | taxonomy_term: id, code, name, description, parent_id, taxonomy, language, term_uri | BFF categories, needs, and policies are published as taxonomies. |
| `attribute` | id, link_id, link_type, link_entity, taxonomy_term_id, value, `label` (3.1) | Generic tagging of any entity with a taxonomy term (plus optional value). This is the official extension point for controlled tags. |
| `metadata` | resource_id, resource_type, last_action_date, last_action_type, field_name, previous_value, replacement_value, updated_by | HSDS's built-in change log. It is field-level, but has no confidence, no source system, and no lock. See §2.3. |
| `meta_table_description` | name, language, character_set | Dataset-level metadata. |

### 2.2 How HSDS models schedules (RRULE-based)

The HSDS 3.x `schedule` borrows iCalendar RFC 5545 RRULE parts as columns ([schema reference](https://docs.openreferral.org/en/latest/hsds/schema_reference.html)):

- **Attachment:** `service_id` | `location_id` | `service_at_location_id`. The service_at_location level is the right one for outreach events.
- **Validity window:** `valid_from`, `valid_to`.
- **Recurrence:** `dtstart`, `until`, `count`, `freq` (WEEKLY / MONTHLY in the description; enum values added in 3.1), `interval`, `wkst`, `byday`, `byweekno`, `bymonthday`, `byyearday`.
- **Times:** `opens_at`, `closes_at`, `timezone` (a numeric UTC offset), `description`, `schedule_link`, `attending_type`, `notes`.

**How BFF patterns map:**

| BFF pattern | HSDS encoding |
|---|---|
| "Tuesdays 2:30–3:30 PM" | `freq=WEEKLY, byday=TU, opens_at=14:30, closes_at=15:30` |
| "every other Thursday" | `freq=WEEKLY, interval=2, byday=TH, dtstart=<a known Thursday>` |
| "2nd and 4th Saturday" | `freq=MONTHLY, byday=2SA,4SA` |
| One-time pop-up | `dtstart=until=<date>, count=1`, with `valid_from` / `valid_to` for expiry |
| Seasonal (winter shelter) | `valid_from` / `valid_to` |
| "Call for hours", "starts ~2:00, line forms early" | Keep `description` / `notes`; mark the schedule as `unstructured` in our extension so "open now" says "unknown" rather than "closed" |

**Extension needed (timezone):** HSDS `timezone` is a fixed UTC offset, which breaks across DST for Boulder (−7/−6). Store `tzid='America/Denver'` in `bff_schedule_ext` and compute occurrences in that zone.

**Extension needed (closures):** HSDS has no exception dates ("closed Thanksgiving"). Add a `bff_schedule_exception` table (date, closed / alt hours, reason, source). It works like RFC 5545 EXDATE.

**Occurrence table:** For open-now queries, expand schedules into a **`schedule_occurrence`** table covering the next 14–30 days. Use a nightly job plus a job on every schedule change, with `python-dateutil` rrule or `rrule.js`. Ranking queries then become a simple range lookup.

### 2.3 HSDS API spec

The spec defines these endpoints ([API reference](https://openreferral.readthedocs.io/en/latest/hsds/api_reference.html)):

| Endpoint | Status | Query parameters |
|---|---|---|
| `GET /` | REQUIRED | Returns `version`, `profile` URI, `openapi_url`; 3.2 adds optional `publisher` and `data_guide` |
| `GET /services` | REQUIRED | `search`, `taxonomy_term_id`, `taxonomy_id`, `organization_id`, `modified_after`, `minimal`, `full`, `page`, `per_page`, `format=json\|ndjson` |
| `GET /services/{id}` | REQUIRED | |
| `/taxonomies`, `/taxonomy_terms` | OPTIONAL | `taxonomy_id`, `top_only`, `parent_id` |
| `/organizations` | OPTIONAL | `full_service` |
| `/service_at_locations` | OPTIONAL | `postcode`, `proximity`, `modified_after` |

POST endpoints were added in 3.1. Query parameters combine with AND, and lists must be paginated.

**Uses for BFF:**

- **Outbound:** expose our published data as an HSDS API so 211 Colorado, Boulder County, or other outreach groups can consume BFF's field-verified data. This builds partnership leverage.
- **Inbound:** a generic "HSDS API connector" that pages `/services?full=true&modified_after=<last_sync>` can ingest any compliant feed.
- **Validation:** check our API with the ORUK validator ([OpenReferralUK/oruk-validator](https://gh.r-mj.com/OpenReferralUK/oruk-validator); it targets the UK profile, so US use is partial; **UNVERIFIED**) and check data against the official JSON schemas.

### 2.4 Extension plan: an HSDS profile ("hsds-bff")

Profiles are JSON Merge Patch (RFC 7386) files named after the HSDS schema they modify. They may add properties, objects, and endpoints, add validation rules, and require value sets. They may not redefine existing terms ([profiles doc](https://openreferral.readthedocs.io/en/latest/hsds/profiles.html)). Tooling: [`hsds_schema_tools`](https://github.com/openreferral) (`profile-all` generates merged schemas and `datapackage.json`), [`hsds-profile-wizard`](https://github.com/openreferral) (BSD-3), and [`hsds_example_profile`](https://github.com/openreferral).

**Principle: use HSDS where an HSDS concept exists, `attribute` + taxonomy for controlled tags, and new objects only for workflow and provenance.**

| BFF need | Mechanism | Detail |
|---|---|---|
| BFF service categories, Eight Dimensions, tiers | `taxonomy` + `taxonomy_term` + `attribute` | Taxonomy `bff-categories` (72 terms) with `parent_id` → a `bff-dimensions` term. Tier stored on `bff_category`. |
| Need concepts (lexicon) | `taxonomy` `bff-needs` + our `need_term` table | Concept → category mapping in `need_category`. |
| **Pet policy** | `attribute`, taxonomy `bff-policy-pets`: `allowed`, `service_animals_only`, `conditional`, `not_allowed`, `unknown`. `attribute.value` holds the caveat text. | Mirrors `petAccess`. Keep an "unknown" default; never infer "no". |
| **Police presence** | `attribute`, taxonomy `bff-policy-police`: `none_expected`, `sometimes`, `usually`, `security_not_police`, `unknown` | Mirrors `police`. Sensitive and safety-relevant: show the "as observed by BFF on <date>" provenance. |
| **Barriers / rules** (ID, sobriety, testing, curfew, referral, insurance, cost, intake time) | `required_document` for documents. `attribute`, taxonomy `bff-requirements` (e.g., `id_required=no`, `sobriety_required=sober_dorm_optional`, `drug_testing=full_panel`). Free-text rules plus URL go in `bff_service_ext.rules_text` / `rules_url`. | Backs the facets "no ID", "no sobriety requirement". The 3 resources with `rules` show the nuance: testing "not necessarily automatic", "not noticeably impaired". Keep text alongside flags. |
| **Audiences** (youth, veterans, LGBTQIA+, tribal, elders) | `attribute`, taxonomy `bff-audience`. Keep them browsable as categories too. | They are currently service categories; they are really eligibility/audience facets. |
| **Modality** (walk-in, outreach event, appointment, phone, online, mobile) | `attribute`, taxonomy `bff-modality` | Drives the "walk up right now" ranking. |
| **Preferred flag** | `bff_service_ext.preferred` (+ `preferred_reason`, `preferred_by`) | Ranking boost; visible badge. |
| **Field notes** | `bff_note` (entity, body, **visibility** = `public` / `volunteer` / `internal`, author, created_at) | Splits today's `notes` into public tips vs internal notes ("ask Andy before publishing phone"). |
| **Verification provenance** | `verification_event` (entity, scope = whole / field list, method = `in_person` / `phone` / `website` / `provider_confirmed` / `source_sync`, verifier, outcome, notes, at) | Drives `assured_date`, "verified N days ago", and staleness. |
| **Provenance label** (today's `status`) | `bff_service_ext.knowledge_basis` enum: `bff_firsthand`, `bff_field_notes`, `bff_event_notes`, `provider_published`, `third_party_directory`, `needs_research`, `national_service` | Displayed as a trust badge. |
| **Per-field source attribution + locked overrides** | `field_assertion` + `field_lock` (§5.6) | Resolver writes the winning values into HSDS tables plus HSDS `metadata` rows for compatibility. |
| **Pop-ups / events** | `service` (or `service_at_location`) + `schedule(count=1)` + `bff_service_ext.is_event`, `expires_at` | Expired events are archived (status `inactive`), not deleted, so they can be reused. |
| **Gaps / follow-ups** | `bff_gap`, `review_item` (kind = `followup`) | Workflow, not HSDS. Not exported. |
| **Decision trees** | `decision_tree`, `tree_node`, `tree_option`, `tree_node_link` | Not HSDS. Versioned content. |
| **Exceptions / closures** | `bff_schedule_exception` | Profile adds `schedule_exception` object. |
| **Crisis flag** | `bff_category.is_crisis` | "MENTAL HEALTH CRISIS" is styled differently today; crisis matches always pin 988/911 at the top. |

**Profile publication:** host `/profile` and `/schema` under a canonical URI and set `GET /`.`profile` to it. Version the profile with SemVer, independent of HSDS.

---

## 3. Taxonomy strategy

### 3.1 Landscape

| Taxonomy | What it is | License / cost | Fit for BFF |
|---|---|---|---|
| **211 HSIS** (formerly AIRS/211 LA County Taxonomy) | About 9,000+ hierarchical terms (e.g., `BH-1800.8500` style codes). The I&R industry standard; used by 211 Colorado (**UNVERIFIED** for Colorado specifically, but it is standard for accredited 211s). | **Proprietary.** Copyright 211 LA. Subscription "limited, non-exclusive, non-transferable, non-sublicensable license"; may not download or use it outside the subscribed access level; lapsed subscribers are "in violation" ([Subscription Agreement](https://taxonomy-sandbox.211la.org/library/Subscription_Agreement.pdf), [211taxonomy.org](https://211taxonomy.org/), [copyright statement](https://211la.org/211-la-taxonomy-copyright-acknowledgement-statement), [registration walkthrough](https://211taxonomy.org/files/view/211HSIS-Registration-Walkthrough.pdf)). **No public pricing found.** Contact: 211hsisapitransition@211la.org (per walkthrough). | **Do not use as BFF's public taxonomy.** Too granular and professional-jargon heavy for street users, and it cannot be redistributed in an open app or offline export. If 211 data arrives tagged with HSIS codes, store the codes as opaque source attributes. Map them to BFF categories through a private crosswalk table, and confirm with 211 LA / Mile High United Way that internal mapping is allowed under the data-sharing agreement (**UNVERIFIED**). |
| **Open Eligibility** | Tag sets for service types plus "situations" (human situations such as homelessness, veterans). Seeded by Aunt Bertha (now Findhelp). | **CC BY-SA 3.0** ([HL7 THO CodeSystem](https://terminology.hl7.org/6.4.0/CodeSystem-OpenEligibilityTaxonomy.html), [CC blog 2013](https://creativecommons.org/2013/12/02/human-services-taxonomy/)). Fork at `openreferral/openeligibility`. Described as dormant since about 2017 ([API Evangelist](https://apievangelist.com/2017/11/12/locking-up-any-taxonomy-is-short-sighted-in-todays-online-environment/)). | **Good open crosswalk target.** Its service/situation split matches our service-category vs audience split. ShareAlike applies only if we redistribute a derivative of the taxonomy itself; a crosswalk table that cites it is low risk, but attribute it. Registered in HL7 terminology, which helps healthcare interop. |
| **Gravity Project SDOH** | HL7 / FHIR SDOH Clinical Care domains (food insecurity, housing instability, homelessness, inadequate housing, transportation insecurity, financial insecurity, material hardship, etc.) with SNOMED / LOINC / ICD-10 value sets in VSAC ([SDOH Clinical Care IG – Gravity terminology](https://build.fhir.org/ig/HL7/fhir-sdoh-clinicalcare/en/gravity_terminology.html), [LinkML Gravity domain enum](https://linkml.io/valuesets/elements/GravitySdohDomainEnum/)). | Value sets are free. Using the underlying SNOMED codes requires a UMLS license (free for US use; **UNVERIFIED** detail). | **Domain-level crosswalk only** (about 15–20 domains). Useful for reporting ("we addressed food insecurity for N people") and for future referrals with clinics such as Clinica (FHIR ServiceRequest). Not a user-facing vocabulary. |
| **Streetlives / YourPeer** | NYC peer-validated directory, 2,600+ services. Top-level categories are roughly Shelter & Housing, Food, Clothing, Personal Care, Health, Other (**UNVERIFIED**: yourpeer.nyc returned 403 to my fetch). Known for "last validated by peer" dates. | Code is MIT ([yourpeer.nyc repo](https://github.com/streetlives/yourpeer.nyc)). Taxonomy license is not stated (**UNVERIFIED**). | **Model for UX tone, not codes:** few top-level, street-native categories plus validation recency. It closely resembles BFF's Tier-1 "Immediate needs". |
| **BFF Eight Dimensions × 3 tiers × 72 categories** | BFF's own, based on the SAMHSA Eight Dimensions of Wellness. | BFF-owned; can be published openly (suggest CC BY 4.0). | **The canonical Layer B.** |

Context: Open Referral's tooling is taxonomy-agnostic. HSDS simply carries `taxonomy` / `taxonomy_term` rows with a `term_uri`, so several taxonomies can coexist on the same service.

### 3.2 Recommended two-layer model (plus crosswalks and facet axes)

```
 Layer A: NEEDS (how people talk)            Layer B: SERVICE CATEGORIES (what BFF lists)   Framing
 need_concept + need_term (EN/ES/slang)  ──▶  bff_category (72, existing)                ──▶ Eight Dimensions × Tier
   "tent got taken" → need:replace_shelter_gear  → Tents & Sleeping Bags                       Environmental · Immediate
   "charge my phone" → need:device_charging       → Device Charging                            Intellectual · Stabilization
   "haven't eaten"   → need:food_now              → Free Meals (+ Food Pantries, lower weight) Physical · Immediate
   "stuff got taken" → situation:property_taken   → decision tree `property` + Legal Assistance
                                                 │
                                   crosswalks ───┤ open_eligibility_tag (CC BY-SA)
                                                 ├ gravity_sdoh_domain
                                                 └ hsis_code (private, licensed use only)

 Orthogonal FACET axes (HSDS attribute taxonomies, not categories):
   audience · requirements/barriers · pets · police · modality · language · accessibility · cost
```

**Layer A: needs lexicon (`need_concept`, `need_term`)**

- **Granularity:** about 150–250 concepts to start. A concept is a need ("food now", "groceries", "shower", "phone charging", "replace ID", "camping ticket") or a *situation* ("stuff taken", "just got out of jail", "kicked out", "fleeing violence", "with a dog").
- **Fields on each concept:**
  - `kind` = need | situation | urgency_cue
  - default `urgency` (now / today / soon / long-term)
  - `crisis` flag
  - optional `decision_tree_id`
  - EN/ES display labels and a plain-language description at about a 5th-grade reading level
- **Terms (many per concept):** canonical phrases, synonyms, slang, common misspellings, and Spanish (including Spanglish), each with `lang`, `kind` (`canonical` / `synonym` / `slang` / `misspelling` / `phrase` / `regex`), and a `weight`. Examples to seed from BFF field experience:
  - **Food:** "haven't eaten", "starving", "hungry", "grub", "food bank", "comida", "tengo hambre", "despensa"
  - **Shelter tonight:** "somewhere to sleep", "a bed", "crash", "no tengo dónde dormir", "albergue", "refugio"
  - **Shelter gear:** "tent got taken / jacked / swept", "my camp got swept", "sleeping bag", "casa de campaña", "bolsa de dormir"
  - **Charging:** "charge my phone", "outlet", "plug in", "dead phone", "cargar mi teléfono"
  - **Phone access:** "obamaphone", "lifeline phone", "free phone"
  - **Hygiene:** "shower", "wash up", "bañarme", "regadera"; "laundry", "lavandería"
  - **ID:** "lost my ID", "birth certificate", "social security card", "acta de nacimiento"
  - **Camping ticket:** "got a ticket", "citation", "court date", "multa", "camping ban"
  - **Property taken:** "cops took my stuff", "sweep", "my stuff got trashed"
  - **Harm reduction:** "narcan", "naloxone", "fentanyl strips", "clean supplies", "rigs"
  - **Detox:** "detox", "get clean", "rehab"
  - **Crisis (always crisis = true):** "suicidal", "want to die", "hurt myself", "quiero morir"
- **Governance:** volunteers propose new terms from the "no results / not what I meant" log (§4.6). An editor approves them. Terms are versioned, and the lexicon is shipped to the client for offline matching.

**Layer B: BFF service categories.** Keep the 72 categories and their dimension/tier placement. Fix the anomalies:

- Add **"Pets"** to a dimension. Suggest Environmental (Stabilization), or Physical, since vet care is involved.
- Decide whether "Outreach Workshops & Activities" belongs to Intellectual or Emotional. A many-to-many `bff_category_dimension` table allows both explicitly.
- Keep "Car Repair" and "Gas Money / Fuel Assistance" even though no resource uses them. They are tracked as gaps.

Publish the categories as HSDS taxonomy `bff-categories` with stable slugs. Display names may change; slugs must not.

**Mapping needs to categories (`need_category`):** many-to-many with a `weight` and optional facet defaults. For example, "food now" → Free Meals (1.0), Food Pantries (0.4), with the facet default `open_within=2h`. This is where "intelligence" lives without AI. A volunteer can tune it in an admin UI.

**Crosswalk tables:** `category_crosswalk(category_id, scheme, code, label, match_type exact|broader|narrower|related)`. Schemes: `open_eligibility`, `gravity_sdoh`, `hsis` (private), `yourpeer`. Ingested 211 records go through `hsis → bff_category` to land in BFF's categories automatically. Unmapped codes go to review.

---

## 4. Non-AI matching design

### 4.1 Query understanding (deterministic)

Input: free text (typed or dictated), plus optional chips the user taps, plus the user's location (opt-in, or a landmark picker such as "Central Park", "Library", "Bandshell").

1. **Normalize:** lowercase, `unaccent`, collapse whitespace, expand contractions ("haven't" → "have not"), normalize common misspellings through the lexicon.
2. **Phrase spotting against `need_term`:** use longest match first, multi-word phrases before single words, and per-language matching. On the server, use a trigram index on `need_term.term_norm` with a similarity threshold (about 0.45) for fuzzy slang and typos. On the client/offline, use the same lexicon in an Aho-Corasick or MiniSearch index ([MiniSearch](https://github.com/lucaong/minisearch), MIT, **UNVERIFIED** license).
3. **Light cue rules (regex/keyword lists):**
   - **Negation:** "not hungry", "don't need a shelter" (window of 3 tokens) → drop the concept.
   - **Time urgency:** "tonight", "right now", "today", "esta noche" → set `open_within`.
   - **Companions:** "my dog", "with my partner", "kids" → set the pets facet or family audience.
   - **Constraints:** "no ID", "lost my ID", "can't do sober" → set barrier facets.
   - **Crisis words** → crisis mode: 988/911 banner and the crisis category pinned first.
4. **Situation → decision tree:** concepts with a `decision_tree_id` (property_taken → `property`, camping_ticket → `camping`, lost_id → `vital`, disability → `disability`, injury → `medical`, …) produce a "Walk through this together" card above results.
5. **Fallback:** if no concept is found, run full-text plus trigram search over services (§4.2) and log the query for lexicon curation.

**Worked example:** "my tent got taken, I need somewhere to charge my phone and I haven't eaten"

| Concept found | Matched term | Result |
|---|---|---|
| `situation:property_taken` | "got taken" | Property tree card |
| `need:replace_shelter_gear` | "tent" + "taken" | Tents & Sleeping Bags (note: TCP "does not distribute tents", which shows why notes matter) |
| `need:device_charging` | "charge my phone" | Device Charging |
| `need:food_now` | "haven't eaten" | Free Meals, Food Pantries |

Results are grouped into three need sections, each sorted by the ranking formula, with "open now / next opening" first. The output is a support plan skeleton the volunteer can save or print.

### 4.2 Retrieval in Postgres

- **`search_doc` materialized view, one row per published `service_at_location`:**
  - `tsv_en = setweight(to_tsvector('english', name),'A') || setweight(…summary/description,'B') || setweight(…category names + need canonical terms,'B') || setweight(…public notes,'C')`
  - `tsv_es` built the same way with the `spanish` config over Spanish fields (human or machine-translated)
  - Use a custom text search configuration with `unaccent` ([unaccent docs](https://www.postgresql.org/docs/current/unaccent.html))
  - GIN indexes on both tsvectors
  - Parse queries with `websearch_to_tsquery` ([Postgres FTS docs](https://www.postgresql.org/docs/current/textsearch-controls.html))
- **Fuzzy:** a `pg_trgm` GIN index on `name` and `org_name` for "bridgehouse", "all rodes", "clinica" ([pg_trgm](https://www.postgresql.org/docs/current/pgtrgm.html)), using `similarity()` or `word_similarity()`.
- **Geo:** PostGIS `geography(Point)` on location, with `ST_DWithin` and `ST_Distance` ([PostGIS](https://postgis.net/docs/ST_DWithin.html)). "Walkable" defaults to ≤ 1.6 km (about 20 minutes), user-adjustable. Later, RTD GTFS could support "on a bus line" (**UNVERIFIED** feed availability and terms).
- **Synonyms in FTS:** the primary path is concept → category, which avoids relying on FTS synonyms. A Postgres thesaurus/synonym dictionary generated from `need_term` can be added for the fallback path.
- **Category retrieval:** `service ⋈ attribute(taxonomy=bff-categories) ∈ categories(concepts)`.

### 4.3 Facets (hard filters, each with an "unknown" state)

| Facet | Source |
|---|---|
| Open now / open within X / open today | `schedule_occurrence` |
| Walkable / within X km | PostGIS |
| Pets OK | `bff-policy-pets` ∈ {allowed, conditional}. Show conditional with the caveat. |
| No ID needed | `required_document` absent ∧ `bff-requirements.id_required = no` |
| No sobriety requirement | `bff-requirements.sobriety_required = no` |
| No police presence | `bff-policy-police` ∈ {none_expected} |
| Spanish spoken | `language` |
| Free | `cost_option` / `fees_description` |
| Walk-in, no appointment | `bff-modality` |
| Audience | `bff-audience` (youth, veteran, women, LGBTQIA+, tribal, elders) |
| Accessible | `accessibility` |

**Important UX rule:** with sparse data (pets known on only 21/111 today), a hard filter would hide most results. Default facets to **"prefer"**, which boosts known-good and keeps unknown below, and offer **"require"** as an explicit toggle. Always show unknown as "Not confirmed. Ask."

### 4.4 Ranking (transparent, tunable, explainable)

```
score = 3.0·need_match            -- concept weight × need_category weight (or FTS rank fallback, scaled 0..1)
      + 2.0·availability          -- 1 open now; 0.8 opens ≤60 min; 0.5 later today; 0.2 this week; 0.3 if hours unknown; 0 closed today
      + 1.5·proximity             -- exp(-distance_km / 1.5); 0.5 if no location
      + 1.0·preferred             -- BFF preferred
      + 1.0·freshness             -- exp(-days_since_verified / half_life_by_category)
      + 0.8·barrier_fit           -- matches "prefer" facets (pets, no ID, no sobriety, no police) ; unknown = 0.4
      + 0.5·knowledge_basis       -- firsthand 1.0, provider_published 0.7, field_notes 0.6, third_party 0.5, needs_research 0.2
      − 2.0·risk_flags            -- temporarily closed, stale beyond 2× cadence, broken link/phone, open review conflict
```

- Weights live in a config table so BFF can tune them. Every result card shows its top two reasons ("Open now · 0.4 mi", "BFF checked 3 days ago").
- **Crisis override:** crisis concepts pin 988 / 911 / crisis services at the top regardless of score.
- **Diversity:** cap each organization at 2 results per need group, so BFF itself does not dominate every list.

### 4.5 Guided decision trees

- **Current state:** BFF has 9 trees in JS (`medical`, `housing`, `employment`, `mental`, `sud`, `camping`, `property`, `vital`, `disability`). Nodes have `q`, `text`, `opts[[label, next]]`, and `links[category]`.
- **Move them to data:** `decision_tree` (slug, title, version, status, reviewed_by, reviewed_at), `tree_node` (question, body markdown, node_type = question / info / action / emergency), `tree_option` (label, next_node), `tree_node_link` (category or need concept, optional facet presets).
- **Translations:** a per-node `i18n` jsonb.
- **Integration:**
  - Lexicon situations can trigger a tree.
  - Each leaf's `links` runs a normal ranked search with facets prefilled.
  - Tree answers can add facets; for example, the housing tree's "Shelter tonight" sets `open_within=tonight`, and the pet branch sets `pets=require`.
  - A completed walk-through is saved into the support plan as steps ("WHERE / HOW / WHO FOLLOWS UP" in the medical tree maps naturally to plan sections).
- **Safety content:** some leaves carry legal or procedural content (camping tickets, property-taken deadlines). Give each tree `reviewed_at` and a review cadence (90 days), plus a disclaimer field.

### 4.6 Learning loop without AI

- Log anonymized query text, matched concepts, clicked results, and "nothing useful" taps. No personal identifiers; retain 90 days.
- A weekly curation screen shows unmatched or low-score queries. A volunteer maps a phrase to a concept in one click. This is how the lexicon grows from real street language.

### 4.7 Where AI plugs in (optional)

- **Query parse:** an LLM turns free text into the same JSON the deterministic parser produces (`{concepts[], facets{}, urgency, crisis, tree}`). It is validated against the concept list, with no free-form categories. If the LLM is unavailable, slow (over 2 s), or returns invalid output, use the deterministic parser.
- **Plan wording:** an LLM may rewrite the plan into friendly prose. The underlying items still come from the ranked database results. An LLM never invents a resource.

---

## 5. Ingestion & enrichment pipeline

### 5.1 Stages

```
[connectors] → raw_fetch (immutable blob, hash, http meta)
            → source_record (per-source parsed, HSDS-shaped JSON + source ids + content hash)
            → change detection (record hash + per-field diff vs previous source_record version)
            → entity resolution (match to canonical org/service/location; crosswalk `entity_link`)
            → field_assertion rows (one per field value, per source, per time)
            → enrichment jobs (deterministic → optional LLM) → more field_assertions (status=suggested)
            → resolver (precedence + locks) → review_item for conflicts / low confidence / new entities
            → publish: write golden HSDS tables + HSDS metadata rows + refresh search_doc + schedule_occurrence
                       + export offline snapshot (HSDS datapackage JSON + lexicon + trees)
```

### 5.2 Connectors (priority order)

| # | Source | Method | Notes |
|---|---|---|---|
| 1 | **BFF legacy JSON** (`BFF_DATA` v3.0 + localStorage popups) | One-time importer, then retired | Split resource → org / service / location. Map `status` → `knowledge_basis`; `notes` → `bff_note` (default visibility `volunteer` until reviewed, because some notes are internal); `petAccess` / `police` → attribute taxonomies via a value map with "unknown" fallback; `eventDay` / `eventTime` / `access` → schedules (§5.4). Every imported value becomes a `field_assertion` with source `bff_legacy_v3` and `locked=true` for BFF-firsthand fields. |
| 2 | **Volunteer / admin edits and field reports** | App UI | Edits are `field_assertion` rows from source `human:<user>`. Optional "lock" checkbox. Quick "Report a change" from a result card ("closed", "hours wrong", "pets OK now") → `review_item`. |
| 3 | **211 (Colorado)** | **211 National Data Platform** Search / Query / Export APIs ([apiportal.211.org](https://apiportal.211.org/); free trial; Export restricted to authorized users; pricing and terms not published), or a direct data-sharing agreement with **Mile High United Way**, which runs 211 Colorado ([211colorado.org](https://211colorado.org/)). Each 211 retains ownership of its data ([211 NDP FAQ](https://register.211.org/Home/FAQs)). Access request form: [211 API Request Form](https://app.smartsheet.com/b/form/c334690c49cd477fb27c7c0176c52d1d) (**UNVERIFIED** that it is the right intake for an external nonprofit). | Pull Boulder County records nightly with `modified` filters. Store HSIS codes as private source attributes. If MHUW provides an iCarol export, reuse Open Referral's [`dbt_icarol_to_hsds`](https://github.com/openreferral) (**UNVERIFIED** which RMS MHUW uses). |
| 4 | **City of Boulder / Boulder County open data** | ArcGIS REST / open data portal; city open data is CC0 ([bouldercolorado.gov/services/open-data](https://bouldercolorado.gov/services/open-data)) | Useful for public facilities: restrooms, drinking fountains, libraries (charging and Wi-Fi), parks, rec centers. No human-services directory API was found for the county (**UNVERIFIED** absence). The SAMPS encampment layer exists but is **not** a service source and should not be used for anything person-identifying. |
| 5 | **Provider websites** | Polite scraper: robots.txt, ≤ 1 request/s, ETag / If-Modified-Since. Extract main text (readability), store snapshot and text hash. | Change detection triggers the enrichment and review path. Only ~18 BFF entries have URLs, so seed the URL list from 211 and Google Places (**UNVERIFIED** terms for storing Places data; prefer not to). Some providers post hours only on Facebook or Instagram, which is not scrapable; use manual verification for those. |
| 6 | **Generic HSDS API / datapackage** | `/services?full=true&modified_after=` paging; HSDS CSV datapackage | For any partner exposing HSDS (and for round-tripping our own export). |
| 7 | **Public facility data from OpenStreetMap** | Overpass query for `amenity=toilets`, `drinking_water`, `shelter`, `charging_station`-like tags in Boulder | ODbL: share-alike on derived *databases* if distributed. Keep OSM-derived rows in a separate layer with attribution (**UNVERIFIED** how ODbL would apply to our snapshot export; get advice). |

### 5.3 Normalization

- **Phones:** E.164 with libphonenumber ([google/libphonenumber](https://github.com/google/libphonenumber), Apache-2.0).
- **Addresses:** standardize, then geocode. Options: US Census Geocoder (free, public domain; [geocoding.geo.census.gov](https://geocoding.geo.census.gov/geocoder/)) or self-hosted Nominatim (the public instance's usage policy forbids bulk use; **UNVERIFIED** current policy text). Hand-pin outreach spots such as "SE corner Central Park" on a map in the admin UI, with `location.description` holding the directions.
- **URLs:** lowercase host, strip tracking parameters; keep the domain for matching.
- **Names:** trim, Unicode NFKC, curly-quote normalization ("Annie & Millie’s Place"), plus an alias table.
- **Statuses:** map each source's status to the HSDS enum.

### 5.4 Hours → structured schedules

1. **Deterministic parser first.** BFF strings are regular: "Tuesday 2:30–3:30 PM", "Monday 4:30 PM", "Tuesdays 2:30–3:30 PM and Fridays 11:00 AM". 24/111 records contain a time pattern. Use a grammar for days (ranges, "weekdays", "M–F", Spanish day names), times (am/pm, en-dash, "noon"), ordinals ("2nd & 4th Sat"), and seasonal words. Output RRULE parts plus a confidence score.
2. **Alternative:** OSM `opening_hours` syntax as an intermediate, via [opening_hours.js](https://github.com/opening-hours/opening_hours.js) (**UNVERIFIED** license; believed LGPL-3.0).
3. **LLM fallback (optional)** for messy prose. The output must validate against a JSON schema of HSDS schedule fields, and it is always stored as `suggested`.
4. **Start-time-only events** ("4:30 PM", 5 records) get `closes_at = null` plus a typical duration from config (e.g., 60 min) and a flag `end_estimated=true`. The UI says "starts 4:30".

### 5.5 Entity resolution / dedupe

At Boulder scale (hundreds to low thousands of records), use **deterministic blocking plus a weighted score plus human confirmation**. A probabilistic Fellegi-Sunter engine is not needed yet.

- **Blocking keys:** normalized phone, URL registrable domain, geohash-7 cell, trigram of the first name token.
- **Score:**
  - org name similarity: `pg_trgm` similarity plus token-set ratio
  - address distance (< 75 m strong)
  - phone equality (strong)
  - domain equality (strong unless the domain is a shared host such as `bouldercounty.gov`)
  - service-name similarity within the org
  - category overlap
- **Thresholds:** above 0.9, auto-link (still logged). Between 0.6 and 0.9, create a `review_item(kind=merge_candidate)` with a side-by-side diff. Below 0.6, create a new entity in `draft`.
- **Crosswalk:** `entity_link(source_id, source_entity_type, source_entity_key, canonical_type, canonical_id, method, score, confirmed_by, confirmed_at)`. Once confirmed, future syncs of that source key go straight to the canonical entity.
- **Negative links:** `entity_non_match` stops repeat suggestions (e.g., "Bridge House" vs "Bridge House Ready to Work" are related but distinct services).
- **Growth path:** if the dataset grows statewide, [Splink](https://github.com/moj-analytical-services/splink) (MIT; probabilistic, DuckDB/Postgres backends) or [dedupe](https://github.com/dedupeio/dedupe) (MIT) can replace the scorer while the crosswalk stays.

### 5.6 Provenance, overrides that survive re-ingestion, change detection

**Field-assertion model.** Every candidate value for every field is a row:

```
field_assertion(id, entity_type, entity_id, field_path, value jsonb, lang,
                source_id, source_record_id, asserted_by, method,       -- 'sync'|'human_edit'|'llm'|'parser'|'import'
                observed_at, confidence, status,                         -- 'active'|'suggested'|'rejected'|'superseded'
                supersedes_id)
field_lock(entity_type, entity_id, field_path, locked_value_assertion_id, locked_by, locked_at, reason, review_after)
source(id, name, kind, trust_rank, default_confidence, license, attribution_text, terms_url, ...)
```

`field_path` examples: `service.description`, `schedule[*]`, `phone[primary].number`, `attribute:bff-policy-pets`.

**Resolver: the published value per field is:**

1. A **locked** human value, if one exists.
2. Otherwise, the latest `active` human-verified assertion younger than the category cadence.
3. Otherwise, the source assertion with the highest `trust_rank × confidence × recency_decay`.
4. LLM or parser assertions are used only if approved, which moves them to `active` with `asserted_by=reviewer`.

**On each re-ingest, compare the new source value to that same source's previous value (not to the published value):**

- **Unchanged** → touch `observed_at`, which is useful as a "still listed" signal.
- **Changed and the field is not locked** → the new assertion wins if it outranks. Write the HSDS `metadata` row (`last_action_type=update`, previous/replacement values). For high-risk fields (hours, address, status, eligibility, pets, police), open a lightweight `review_item(kind=source_change)` so a volunteer sees "211 changed hours for X".
- **Changed and the field is locked** → keep the locked value and open `review_item(kind=field_conflict)` showing both values plus source and date. The reviewer can keep the lock, accept the new value (unlock), or edit.
- **Disappeared from source** → do not delete. After N consecutive missing syncs, open `review_item(kind=possibly_closed)`.
- **Change detection inputs:** `raw_fetch.content_hash` (skip unchanged payloads), a per-record canonical-JSON hash, and, for websites, a text hash plus a diff summary stored on the review item.

**Per-field attribution in the UI:** "Hours: from 211 Colorado, synced Nov 12 · Pets: BFF field notes, Oct 3 (locked)". `source.attribution_text` satisfies license attribution (CC BY-SA, ODbL, 211 agreements).

### 5.7 Enrichment (deterministic first, LLM optional)

| Enrichment | Deterministic | LLM-optional | Auto-publish? |
|---|---|---|---|
| Plain-language summary (≤ 2 sentences, about grade 5) | Use BFF `summary` | Generate from description + notes | No. Review. Low risk, so batch-approve. |
| Need tags / categories | Crosswalk (HSIS → BFF), keyword rules on name/description | Classify into the BFF categories + need concepts (closed list) | No |
| Hours → schedule | Grammar parser (§5.4) | Schema-constrained extraction | Only parser output with confidence ≥ 0.95 *and* source not BFF-locked. Otherwise review. |
| Eligibility / requirements → flags | Keyword rules ("photo ID required", "must be sober", "ages 18–24") | Extraction to `bff-requirements` flags + evidence quote | No. Store the evidence span. |
| Spanish translation | Lexicon-only for labels | MT of summaries, access, and tree text | Publish marked "machine-translated, not yet reviewed" for non-safety text. Crisis and legal text requires human review. |
| Link / phone health | HTTP check, phone format | none | Yes, as risk flags only |
| Geocoding | Census / Nominatim | none | Yes if the match is "exact"; otherwise review |

Every LLM call records `model`, `prompt_version`, and `input_hash` on the assertion (`method='llm'`, `asserted_by='llm:<model>@<prompt_v>'`), so outputs can be re-run, audited, or bulk-rejected.

### 5.8 Review queue

`review_item(kind, entity, payload jsonb, priority, status, assigned_to, due_at, resolution, resolved_by, resolved_at)`

- **Kinds:** `new_entity`, `merge_candidate`, `field_conflict`, `source_change`, `llm_suggestion`, `stale`, `possibly_closed`, `broken_contact`, `user_report`, `followup` (absorbs today's `followups`), and `lexicon_candidate`.
- **Priority:** safety (crisis, shelter, police, pets) > Immediate-tier categories > others.
- **UI:** a mobile-friendly "swipe to approve" view, so volunteers can clear items in the field.

### 5.9 Verification cadence & staleness

| Category class | Cadence (half-life for the freshness score) | Examples |
|---|---|---|
| Outreach events / meals / pop-ups | 30 days (event pop-ups expire automatically) | Free Meals, BFF events, Showers |
| Shelter / safe parking / crisis | 30 days | Shelters, MENTAL HEALTH CRISIS |
| Clinical, legal, benefits | 90 days | Medical Care, Legal Assistance, SNAP Enrollment |
| National hotlines / established services | 180 days | 988, national services |
| Decision-tree legal/procedural leaves | 90 days | camping, property, vital |

- `stale = now() − last_verified > cadence`. The UI shows an amber "May be out of date. Call first."
- At `2 × cadence`, the ranking penalty applies and a `review_item(kind=stale)` is auto-created.
- `service.assured_date` is set from the latest verification event.
- `verification_event` with `method=source_sync` counts as weak verification (e.g., 0.5 weight). In-person and provider-confirmed checks count fully.

### 5.10 Publish & offline

- Publishing is transactional. It writes the golden HSDS tables and refreshes `search_doc` and `schedule_occurrence`.
- It also emits a versioned **offline snapshot**: an HSDS-shaped JSON of published services, the lexicon, trees, and category metadata, gzipped. Estimated size is under 1–2 MB for about 1,000 services (**estimate**).
- The phone/tablet app can match fully offline with the same deterministic algorithm in JS.
- Internal notes and `hsis` crosswalks are **excluded** from public exports.

---

## 6. Reusable OSS

License and status were checked on GitHub pages where noted. The GitHub API was blocked in this session, so some details are from search results and marked accordingly.

| Project | What | License | Maturity / status | Recommendation |
|---|---|---|---|---|
| [openreferral/specification](https://github.com/openreferral/specification) | HSDS JSON schemas, OpenAPI 3.1, docs | Spec CC BY-SA 4.0 (per OR docs) | Active (updated 2026-10-29; v3.2.3) | **Use**: vendor the schemas; generate DDL / validation from them. |
| [openreferral/hsds_schema_tools](https://github.com/openreferral) | Python tools; `profile-all` builds merged profile schemas + datapackage | **UNVERIFIED** | Active (2026-10-28) | **Use** to build and publish the `hsds-bff` profile. |
| [openreferral/hsds-profile-wizard](https://github.com/openreferral) | Helper for generating profiles | BSD-3-Clause | Active (2026-09) | **Use** |
| [openreferral/mock-hsds-api](https://github.com/openreferral) | Minimal Flask app mimicking the HSDS API | BSD-3-Clause | Active (2026-08) | **Reference** for our API layer and tests |
| [openreferral/hsds_example_profile](https://github.com/openreferral) | Example profile | **UNVERIFIED** | 2024 | Reference |
| [openreferral/dbt_icarol_to_hsds](https://github.com/openreferral) | dbt models converting iCarol exports to HSDS | **UNVERIFIED** | 2022 | **Use if** 211 Colorado data comes as iCarol |
| [openreferral/sample-HSDS-datapackage](https://github.com/openreferral) | Sample data | **UNVERIFIED** | older | Test fixtures |
| [openreferral/hsds-transformer](https://github.com/openreferral/hsds-transformer) | Ruby: CSV → HSDS datapackage | MIT | **Archived** | Learn only |
| [openreferral/hsds-validator](https://github.com/openreferral/hsds-validator) / [stevensblueprint hsds-validator (PyPI)](https://pypi.org/project/hsds-validator/) | CSV datapackage validation | **UNVERIFIED** | Older; built for HSDS 1.x/2.x (**UNVERIFIED**) | Prefer JSON-Schema validation against 3.x schemas |
| [OpenReferralUK/oruk-validator](https://gh.r-mj.com/OpenReferralUK/oruk-validator) | API conformance validator (Docker) for the UK profile | **UNVERIFIED** | Active-ish (**UNVERIFIED**) | Try against our API for structural checks |
| [sarapis/orservices](https://github.com/sarapis/orservices) ("ORServices") | Laravel / PHP + Vue directory app with HSDS model, Airtable sync | **UNVERIFIED** | HSDS 1.x/2.x era (**UNVERIFIED** 3.x support) | Learn from the admin UX; don't adopt (stack mismatch, old HSDS) |
| [codeforamerica/ohana-api](https://github.com/codeforamerica/ohana-api) | Rails API + admin for service directories; Open Eligibility built in | BSD-3-Clause | Legacy (Ruby 2.7 / Rails 5.2); low activity (**UNVERIFIED**) | Learn only (pre-HSDS-3 data model, admin roles) |
| [ShelterTechSF/askdarcel-api](https://github.com/ShelterTechSF/askdarcel-api) (+ askdarcel-web) | Rails API behind SF Service Guide; volunteer "datathons" for vetting | **GPL-3.0** (API); web **UNVERIFIED** | Maintained-ish (70 open issues) | **Learn from** its volunteer change-request workflow (**UNVERIFIED** table names). Don't copy code into a non-GPL codebase. |
| [streetlives/yourpeer.nyc](https://github.com/streetlives/yourpeer.nyc) | Next.js / TypeScript peer-validated directory (2,600+ NYC services) with `AI_SEARCH_ENABLED` server flag | MIT | Active (~1,000 commits) | **Closest analogue.** Study the UX, "last validated" display, and AI-optional flag pattern. Backend is [streetlives-api](https://github.com/streetlives) (Node + PostGIS, MIT per search). |
| [auntbertha/openeligibility](https://github.com/openreferral) (fork in openreferral org) | Open Eligibility taxonomy | CC BY-SA 3.0 | Dormant | Crosswalk target |
| [Splink](https://github.com/moj-analytical-services/splink) / [dedupe](https://github.com/dedupeio/dedupe) | Entity resolution | MIT / MIT (from prior knowledge; verify) | Mature | Later-stage dedupe |
| [python-dateutil rrule](https://dateutil.readthedocs.io/en/stable/rrule.html) / [rrule.js](https://github.com/jkbrzt/rrule) | RRULE expansion | Apache-2.0/BSD dual; rrule.js BSD (**UNVERIFIED**) | Mature | Use for `schedule_occurrence` |
| [libphonenumber](https://github.com/google/libphonenumber) | Phone normalization | Apache-2.0 | Mature | Use |
| DC Open211, Connect211 | Named in the brief | not found in this session | **UNVERIFIED** | The openreferral org has an archived `open211-miami-data-api`. I could not locate canonical DC Open211 / Connect211 repos; treat as historical. |

**Takeaways:**

1. There is no turnkey HSDS 3.x directory app that fits our stack and AI-optional UX. Build on the spec and tools rather than an app.
2. YourPeer is the best product reference.
3. Avoid GPL code contamination (AskDarcel) if BFF wants a permissive license.

---

## 7. Draft schema (Postgres 16 + PostGIS + pg_trgm + unaccent)

Schemas: `hsds` (published golden record, names match HSDS 3.x), `bff` (extensions), `ingest` (staging / provenance), `match` (lexicon / search), `ops` (review / workflow). Columns are abridged. All ids are `uuid` unless noted. All tables have `created_at` and `updated_at`.

### 7.1 `hsds` (published; matches HSDS 3.x field names)

| Table | Key columns (abridged) |
|---|---|
| `hsds.organization` | id, name, alternate_name, description, email, website, parent_organization_id, legal_status, year_incorporated, logo, uri |
| `hsds.program` | id, organization_id, name, alternate_name, description |
| `hsds.service` | id, organization_id, program_id, name, alternate_name, description, url, email, **status** (enum active/inactive/defunct/temporarily closed), interpretation_services, application_process, fees_description, eligibility_description, minimum_age, maximum_age, **assured_date**, assurer_email, alert, last_modified |
| `hsds.location` | id, location_type, organization_id, name, alternate_name, description, transportation, latitude, longitude, external_identifier, external_identifier_type, `geom geography(Point,4326)` (generated) |
| `hsds.service_at_location` | id, service_id, location_id, description |
| `hsds.address` | id, location_id, attention, address_1, address_2, city, region, state_province, postal_code, country, address_type |
| `hsds.phone` | id, location_id, service_id, organization_id, contact_id, service_at_location_id, number, extension, type, description |
| `hsds.contact` | id, organization_id, service_id, service_at_location_id, location_id, name, title, department, email |
| `hsds.schedule` | id, service_id, location_id, service_at_location_id, valid_from, valid_to, dtstart, timezone, until, count, wkst, freq, interval, byday, byweekno, bymonthday, byyearday, description, opens_at, closes_at, schedule_link, attending_type, notes |
| `hsds.service_area` | id, service_id, service_at_location_id, name, description, extent, extent_type, uri |
| `hsds.language` | id, service_id, location_id, phone_id, name, code, note |
| `hsds.accessibility` | id, location_id, description, details, url |
| `hsds.required_document` | id, service_id, document, uri |
| `hsds.cost_option` | id, service_id, valid_from, valid_to, option, currency, amount, amount_description |
| `hsds.service_capacity` / `hsds.unit` | per HSDS 3.1 (e.g., beds, meals) |
| `hsds.url` | id, label, url, organization_id, service_id (3.1) |
| `hsds.funding`, `hsds.organization_identifier` | per HSDS |
| `hsds.taxonomy` | id, name, description, uri, version |
| `hsds.taxonomy_term` | id, code, name, description, parent_id, taxonomy_id, language, term_uri |
| `hsds.attribute` | id, link_id, link_type, link_entity, taxonomy_term_id, value, label |
| `hsds.metadata` | id, resource_id, resource_type, last_action_date, last_action_type, field_name, previous_value, replacement_value, updated_by |
| `hsds.meta_table_description` | id, name, language, character_set |

Seed taxonomies: `bff-dimensions`, `bff-categories`, `bff-needs`, `bff-policy-pets`, `bff-policy-police`, `bff-requirements`, `bff-audience`, `bff-modality`.

### 7.2 `bff` (extensions; 1:1 or 1:n by HSDS id)

| Table | Key columns |
|---|---|
| `bff.dimension` | id, slug, name, color (from `colors`), sort |
| `bff.category` | id, taxonomy_term_id → hsds.taxonomy_term, slug, name, tier (1 Immediate / 2 Stabilization / 3 Long-term), is_crisis, verification_cadence_days, description_plain, i18n jsonb |
| `bff.category_dimension` | category_id, dimension_id, tier, sort *(many-to-many; fixes the "Outreach Workshops" double listing)* |
| `bff.category_crosswalk` | category_id, scheme (`open_eligibility`/`gravity_sdoh`/`hsis`/`yourpeer`), code, label, match_type, is_private |
| `bff.service_ext` | service_id PK, preferred, preferred_reason, knowledge_basis enum, summary_plain, summary_plain_es, rules_text, rules_url, is_event, expires_at, end_estimated, crisis_contact, legacy_id (`r001`…) |
| `bff.note` | id, entity_type, entity_id, body, lang, visibility (`public`/`volunteer`/`internal`), author_id, pinned |
| `bff.schedule_ext` | schedule_id PK, tzid (default `America/Denver`), unstructured bool, parse_confidence, typical_duration_min |
| `bff.schedule_exception` | id, schedule_id or service_at_location_id, date, closed bool, opens_at, closes_at, reason, source_id |
| `bff.schedule_occurrence` | service_at_location_id, starts_at timestamptz, ends_at timestamptz, schedule_id, estimated_end bool. Index: `tstzrange(starts_at, ends_at)` GiST |
| `bff.verification_event` | id, entity_type, entity_id, field_paths text[] (null = whole record), method, outcome (`confirmed`/`changed`/`closed`/`unreachable`), verifier_id, notes, verified_at |
| `bff.gap` | id, title, ideas, owner, status, category_id, created_by *(today's `gaps`)* |
| `bff.decision_tree` | id, slug, title, version, status, disclaimer, reviewed_by, reviewed_at, review_cadence_days, i18n |
| `bff.tree_node` | id, tree_id, key, node_type, question, body_md, i18n |
| `bff.tree_option` | id, node_id, label, next_node_id, sort, sets_facets jsonb, i18n |
| `bff.tree_node_link` | node_id, category_id, need_concept_id, facet_preset jsonb |
| `bff.app_user` | id, display_name, role (`viewer`/`volunteer`/`editor`/`admin`), auth_subject |

### 7.3 `match` (lexicon & search)

| Table | Key columns |
|---|---|
| `match.need_concept` | id, slug, kind (`need`/`situation`/`urgency_cue`), label_en, label_es, description_plain, default_urgency, crisis bool, decision_tree_id, taxonomy_term_id (in `bff-needs`), status |
| `match.need_term` | id, concept_id, term, term_norm (generated: lower+unaccent), lang (`en`/`es`/`mixed`), kind (`canonical`/`synonym`/`slang`/`misspelling`/`phrase`/`regex`), weight, approved_by. Index: GIN `term_norm gin_trgm_ops` |
| `match.need_category` | concept_id, category_id, weight, facet_defaults jsonb |
| `match.cue_rule` | id, kind (`negation`/`urgency`/`companion`/`barrier`/`crisis`), pattern, lang, effect jsonb |
| `match.ranking_config` | key, value numeric (weights, half-lives, walk radius) |
| `match.search_doc` (materialized view) | service_at_location_id, service_id, org_name, name, category_ids[], concept_ids[], facet columns (pets, police, id_required, sobriety_required, spanish, free, walk_in, audiences[]), geom, preferred, last_verified_at, knowledge_basis, risk_flags, tsv_en, tsv_es. Indexes: GIN(tsv_en), GIN(tsv_es), GIN(name gin_trgm_ops), GiST(geom) |
| `match.query_log` | id, at, text_norm (no PII), lang, concepts[], facets jsonb, result_ids[], clicked_id, no_useful_result bool *(90-day retention)* |

### 7.4 `ingest` (sources, raw, provenance)

| Table | Key columns |
|---|---|
| `ingest.source` | id, slug (`bff_legacy_v3`, `211_ndp`, `boulder_open_data`, `osm`, `web:<domain>`, `human`, `llm`), kind, trust_rank, default_confidence, license, attribution_text, terms_url, sync_schedule, enabled |
| `ingest.sync_run` | id, source_id, started_at, finished_at, status, stats jsonb, error |
| `ingest.raw_fetch` | id, sync_run_id, url/endpoint, http_status, etag, last_modified, content_hash, storage_uri (blob), fetched_at |
| `ingest.source_record` | id, source_id, source_key (the source's own id), entity_type, payload jsonb (HSDS-shaped), record_hash, first_seen_at, last_seen_at, missing_count, raw_fetch_id, version |
| `ingest.entity_link` | id, source_id, source_key, entity_type, canonical_id, method (`auto`/`human`), score, confirmed_by, confirmed_at |
| `ingest.entity_non_match` | source_id, source_key, canonical_id, decided_by |
| `ingest.field_assertion` | id, entity_type, entity_id, field_path, value jsonb, lang, source_id, source_record_id, method (`sync`/`human_edit`/`import`/`parser`/`llm`), asserted_by, model, prompt_version, evidence text, confidence, status (`active`/`suggested`/`rejected`/`superseded`), observed_at, supersedes_id. Index: (entity_type, entity_id, field_path, status) |
| `ingest.field_lock` | entity_type, entity_id, field_path PK, assertion_id, locked_by, locked_at, reason, review_after |
| `ingest.enrichment_job` | id, kind, entity_type, entity_id, status, model, prompt_version, input_hash, output jsonb, cost_cents, created_at |

### 7.5 `ops` (workflow)

| Table | Key columns |
|---|---|
| `ops.review_item` | id, kind, entity_type, entity_id, payload jsonb (diff, candidates, evidence), priority, status (`open`/`snoozed`/`resolved`/`dismissed`), assigned_to, due_at, resolution jsonb, resolved_by, resolved_at |
| `ops.user_report` | id, service_id, report_kind (`closed`/`hours_wrong`/`moved`/`policy_change`/`other`), message, reporter_role, created_at → spawns review_item |
| `ops.publish_run` | id, started_at, finished_at, snapshot_uri, snapshot_version, counts jsonb |
| `ops.audit_log` | id, actor_id, action, entity_type, entity_id, before jsonb, after jsonb, at |

*(Support plans are personal data. Keep them client-side or in a separate, access-controlled schema with minimal retention. That is out of scope here; see the privacy research doc.)*

### 7.6 Key queries (sketch)

```sql
-- Open now within walking distance for a set of categories, ranked
WITH q AS (SELECT ST_MakePoint(:lon,:lat)::geography AS here, now() AS t)
SELECT d.*, ST_Distance(d.geom, q.here)/1000 AS km,
       EXISTS (SELECT 1 FROM bff.schedule_occurrence o
               WHERE o.service_at_location_id = d.service_at_location_id
                 AND q.t BETWEEN o.starts_at AND o.ends_at) AS open_now
FROM match.search_doc d, q
WHERE d.category_ids && :category_ids
  AND (:walk_km IS NULL OR ST_DWithin(d.geom, q.here, :walk_km*1000))
  AND (:require_pets = false OR d.pets IN ('allowed','conditional'))
ORDER BY /* weighted score per §4.4 computed in SQL or app */ ...;

-- Fuzzy lexicon lookup for an n-gram from the user's text
SELECT c.slug, t.weight * similarity(t.term_norm, unaccent(lower(:ngram))) AS s
FROM match.need_term t JOIN match.need_concept c ON c.id = t.concept_id
WHERE t.term_norm % unaccent(lower(:ngram))
ORDER BY s DESC LIMIT 5;
```

---

## 8. Sources

**HSDS / Open Referral**
- HSDS schema reference: https://docs.openreferral.org/en/latest/hsds/schema_reference.html
- HSDS changelog (3.1–3.2.3): https://openreferral.readthedocs.io/en/latest/hsds/changelog.html
- HSDS API reference: https://openreferral.readthedocs.io/en/latest/hsds/api_reference.html
- HSDS profiles: https://openreferral.readthedocs.io/en/latest/hsds/profiles.html
- HSDS FAQ: https://openreferral.readthedocs.io/en/latest/hsds/hsds_faqs.html
- Open Referral initiative docs: https://openreferral.readthedocs.io/en/latest/initiative/
- Spec repo: https://github.com/openreferral/specification · Org repos: https://github.com/openreferral
- HSDS transformer (archived): https://github.com/openreferral/hsds-transformer
- Validators: https://github.com/openreferral/hsds-validator · https://pypi.org/project/hsds-validator/ · https://gh.r-mj.com/OpenReferralUK/oruk-validator
- Frictionless Data / Open Referral tool fund: https://frictionlessdata.io/blog/2020/01/22/open-referral-tool/

**Taxonomies**
- 211 HSIS subscription agreement: https://taxonomy-sandbox.211la.org/library/Subscription_Agreement.pdf
- 211 taxonomy site: https://211taxonomy.org/ · Registration walkthrough: https://211taxonomy.org/files/view/211HSIS-Registration-Walkthrough.pdf
- 211 LA copyright statement: https://211la.org/211-la-taxonomy-copyright-acknowledgement-statement
- Open Eligibility (HL7 THO): https://terminology.hl7.org/6.4.0/CodeSystem-OpenEligibilityTaxonomy.html
- Creative Commons on Open Eligibility: https://creativecommons.org/2013/12/02/human-services-taxonomy/
- API Evangelist on locked taxonomies: https://apievangelist.com/2017/11/12/locking-up-any-taxonomy-is-short-sighted-in-todays-online-environment/
- Gravity terminology in SDOH Clinical Care IG: https://build.fhir.org/ig/HL7/fhir-sdoh-clinicalcare/en/gravity_terminology.html
- Gravity domain enum (LinkML): https://linkml.io/valuesets/elements/GravitySdohDomainEnum/
- US Core SDOH assessments value set: https://hl7.org/fhir/us/core/2022Jan/ValueSet-us-core-common-sdoh-assessments.html

**Data sources**
- 211 National Data Platform API portal: https://apiportal.211.org/ · FAQ: https://register.211.org/Home/FAQs
- 211 API request form: https://app.smartsheet.com/b/form/c334690c49cd477fb27c7c0176c52d1d
- 211 Colorado: https://211colorado.org/ · Mile High United Way 211: https://unitedwaydenver.org/211
- Colorado OeHI CRI research brief (HSDS adoption among Colorado CRIs): https://oehi.colorado.gov/sites/oehi/files/documents/CRI%20Research%20Brief.pdf
- City of Boulder open data (CC0): https://bouldercolorado.gov/services/open-data
- US Census Geocoder: https://geocoding.geo.census.gov/geocoder/

**OSS**
- YourPeer: https://github.com/streetlives/yourpeer.nyc · Streetlives org: https://github.com/streetlives
- AskDarcel API: https://github.com/ShelterTechSF/askdarcel-api · SF Service Guide help: https://help.sfserviceguide.org/
- Ohana API: https://github.com/codeforamerica/ohana-api
- ORServices: https://github.com/sarapis/orservices
- Splink: https://github.com/moj-analytical-services/splink · dedupe: https://github.com/dedupeio/dedupe
- python-dateutil rrule: https://dateutil.readthedocs.io/en/stable/rrule.html · rrule.js: https://github.com/jkbrzt/rrule
- opening_hours.js: https://github.com/opening-hours/opening_hours.js
- libphonenumber: https://github.com/google/libphonenumber
- MiniSearch: https://github.com/lucaong/minisearch

**Postgres**
- Full-text search controls: https://www.postgresql.org/docs/current/textsearch-controls.html
- pg_trgm: https://www.postgresql.org/docs/current/pgtrgm.html
- unaccent: https://www.postgresql.org/docs/current/unaccent.html
- PostGIS ST_DWithin: https://postgis.net/docs/ST_DWithin.html

**Open questions to resolve (owner: BFF + tech lead)**
1. 211 data access path and terms: NDP Export vs a direct MHUW agreement; whether HSIS codes may be stored and crosswalked internally.
2. License for BFF's own published data and taxonomy (suggest CC BY 4.0 for categories and lexicon; consider ODbL implications if OSM layers are included in exports).
3. Policy for police-presence data: who may see it, and how to word it.
4. Whether internal `notes` move to `volunteer` visibility by default during migration. Recommended yes, pending a human pass.
