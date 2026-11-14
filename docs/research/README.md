# Research Synthesis — BFF Resource Navigator

*Prepared by Benjamin Life ([@omniharmonic](https://github.com/omniharmonic)), 2026-11-14. Five parallel research tracks; full memos linked below.*

| # | Memo | One-line takeaway |
|---|---|---|
| 00 | [Project context](00-project-context.md) | Libby wants a *navigator* tool: problem-first, 3 tiers (now / next time / long-term), field notes are the moat, paper is the handoff. |
| 01 | [211 & aggregators](01-211-and-aggregators.md) | No open 211 feed. 211 National Data Platform (HSDS, delta export) works with permission from Mile High United Way. findhelp cannot be ingested. |
| 02 | [Open data & 311](02-open-data-and-311.md) | Open data gives a self-refreshing map of **places** (parks, restrooms season, Wi-Fi, transit, needle drops, naloxone, clinics, SNAP), not **services**. Boulder 311 is stale/irrelevant; Denver 311 is a useful taxonomy reference. |
| 03 | [Boulder service landscape](03-boulder-service-landscape.md) | All Roads' bilingual street sheet is the canonical source and is watchable. ~20 providers missing from BFF data; several stale. Street meals and mutual aid exist only in field knowledge, so that's BFF's edge. |
| 04 | [Data model, taxonomy, matching](04-data-model-taxonomy-matching.md) | HSDS 3.x core + BFF profile. Per-field provenance, so volunteer edits survive re-ingestion. Plain-language needs lexicon → BFF's 72 categories. Strong non-AI matching. |
| 05 | [AI, voice, print, stack](05-ai-voice-print-stack.md) | Next.js + Neon + Vercel holds. GitHub Actions for ingestion. Claude as an optional parser and ranker, grounded in DB IDs only. Keyboard dictation for voice. iOS can't drive a thermal printer directly, so a Pi print bridge or a CloudPRNT printer is needed. |

## Converging architecture (pre-PRD)
1. **Data spine:** Postgres (Neon), HSDS-shaped tables plus `bff_*` extensions (field notes, pets, police, rules, preferred, tier, verification history). Every field value stores its source and date, a resolver picks what gets published, and locked human edits always win.
2. **Ingestion (GitHub Actions, nightly/weekly):** BFF seed (111) → All Roads street sheet watcher → city/county ArcGIS layers → FindTreatment / HRSA / LADDERS / CDPHE / USDA SNAP → (later) 211 NDP delta export once MHUW approves. Changes from sources go into a review queue rather than overwriting.
3. **Enrichment (AI optional):** plain-language summary, need tags, parsed hours, eligibility, Spanish. AI output is always a suggestion until a human accepts it.
4. **Matching:** needs lexicon (EN/ES/slang) → categories → full-text + fuzzy search → ranking (open now, tier, preferred, verified recency). Decision trees for situations like a camping ticket, property taken or ID. The optional Claude layer parses free text and re-ranks candidates; the server drops any ID the model invents.
5. **Plans:** add-to-plan basket → plan grouped by tier → print (thermal, PDF), anonymous share link plus QR, saved to a volunteer's account under a nickname tag.
6. **Wiki:** volunteer forms + review queue + revision history; gaps and follow-ups; pop-up events with auto-expiry.
7. **Safety:** crisis keywords detected on-device (988 / BHCR first), PII stripped before any AI call, no location tracking, no encampment or "report a person" data, ever.

## Decisions needed (consolidated)
See the chat summary. Remaining non-blocking questions live in each memo's *Open questions* section.
