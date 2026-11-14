# Technical Architecture — BFF Resource Navigator

*v1.0 · 2026-11-14 · Benjamin Life ([@omniharmonic](https://github.com/omniharmonic))*
*Companion to [PRD.md](PRD.md). Research basis: [docs/research](research/README.md).*

## 1. System overview

```
                ┌──────────────────────── Vercel (navigator.boulderfeetforward.org) ───────────────────────┐
 Phone/tablet ─▶│ Next.js 16 App Router (React Server Components + Server Actions)                          │
  (volunteer,   │                                                                                            │
   participant) │  UI: /help (participant) · /navigator (volunteer) · /p/[token] · /services · /admin · …    │
                │  lib/match  ── lexicon matcher (always) ──┐                                               │
                │  lib/ai/jev ── TypeSafe Jev (optional) ───┼─▶ ranked categories ─▶ services ─▶ plan        │
                │  lib/crisis ── keyword crisis detector ───┘                                               │
                │  lib/auth  ── Better Auth (email OTP via Resend)                                           │
                │  lib/db    ── Drizzle ORM ── Neon serverless driver ─────────────┐                        │
                └──────────────────────────────────────────────────────────────────┼────────────────────────┘
                                                                                   ▼
                                                                    Neon Postgres (HSDS-aligned schema)
                                                                                   ▲
                ┌──────────── GitHub Actions (nightly cron) ────────────┐          │
                │ scripts/ingest.ts → connectors/* → normalize → diff ──┼──────────┘
                │   (ArcGIS, FindTreatment, HRSA, All Roads watcher,     │  → auto-apply feed-owned fields
                │    211 NDP later)                                     │  → review queue for everything else
                └───────────────────────────────────────────────────────┘
```

**Why this shape:** Vercel and Neon are already in BFF's toolbox. The app is small (fewer than 1,000 services and about 20 volunteers), so matching runs in memory over a cached service snapshot. That's fast, testable and database-agnostic. Long-running ingestion stays off Vercel functions (Hobby plan: 300 s limit, cron once a day) and runs in GitHub Actions instead.

## 2. Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Next.js 16** (App Router, TypeScript, Server Actions) | One codebase for UI and API |
| Styling | Plain CSS with design tokens (BFF brand) | No CSS framework; tokens on `:root`, dark mode via `prefers-color-scheme` |
| DB | **Neon Postgres** (prod) / **PGlite** (local dev and tests) | Same Drizzle schema; `DATABASE_URL` selects the driver |
| ORM | **Drizzle ORM** + drizzle-kit migrations | Typed queries |
| Auth | **Better Auth** + `emailOTP` plugin; Drizzle adapter | 6-digit codes; `role` and `volunteerStatus` columns on `user` |
| Email | **Resend** (fallback: console log in dev) | Free tier 100/day, enough for launch |
| AI (optional) | **TypeSafe Jev** `POST https://api.typesafe.ai/v1/systemone`, model `jev-latest` | Typed answers (noul/choice/score) with probabilities |
| QR | `qrcode` (SVG, server-rendered) | |
| Ingestion | `tsx scripts/ingest.ts` on GitHub Actions cron | Writes through the same `lib/` code |
| Tests | Vitest | Matcher, crisis, provenance resolver, redaction |

## 3. Data model

HSDS 3.x concepts flattened into a single `services` table for v1 (organization and location are embedded). HSDS export is a mapping layer, not a storage constraint, which keeps the volunteer forms simple.

### 3.1 Tables

| Table | Purpose | Key columns |
|---|---|---|
| `user`, `session`, `account`, `verification` | Better Auth | `user.role` (`participant`/`volunteer`/`admin`), `user.volunteer_status` (`none`/`requested`/`approved`/`rejected`), `user.display_name` |
| `dimensions` | Eight Dimensions of Wellness | `slug`, `name`, `color`, `position` |
| `categories` | Libby's 72 categories | `slug`, `name`, `dimension_slug`, `tier` (1/2/3), `description`, `icon`, `is_crisis` |
| `services` | A thing someone can go to or call | `id`, `name`, `organization`, `summary`, `access` (how to access), `field_notes`, `internal_notes`, `phone`, `url`, `email`, `address`, `lat`, `lng`, `hours_text`, `schedule` (jsonb weekly spans), `eligibility`, `pet_policy`, `police`, `rules`, `rules_url`, `preferred`, `status` (`active`/`temporary`/`unverified`/`inactive`), `starts_at`, `ends_at` (pop-ups), `verified_at`, `verified_by`, `field_sources` (jsonb), `locked_fields` (text[]), `external_ids` (jsonb), `created_at`, `updated_at` |
| `service_categories` | many-to-many | `service_id`, `category_slug`, `tier_override` |
| `need_terms` | Plain-language lexicon | `phrase`, `category_slug`, `weight` (0–1), `lang` |
| `change_requests` | Review queue | `id`, `kind` (`create`/`update`/`archive`), `service_id`, `payload` (jsonb field → value), `source` (`volunteer`/`feed:<name>`/`ai`), `proposed_by`, `status` (`pending`/`approved`/`rejected`), `reviewer_id`, `review_note`, timestamps |
| `service_revisions` | Immutable history | `service_id`, `snapshot` (jsonb), `change_request_id`, `actor`, `created_at` |
| `plans` | Support plans | `id`, `share_token` (unique), `owner_id` (nullable), `for_label` (nickname/initials), `tags` (text[]), `intake_text` (optional, owner-only), `navigator_name`, `created_at`, `updated_at`, `expires_at` |
| `plan_items` | Plan lines | `plan_id`, `service_id`, `tier`, `note`, `position` |
| `decision_trees` | Libby's trees as data | `slug`, `title`, `nodes` (jsonb) |
| `gaps` | Gaps & follow-ups | `kind` (`gap`/`followup`), `title`, `ideas`, `owner`, `status` |
| `settings` | Feature flags | `key`, `value` (jsonb): `participant_mode`, `ai_assist` |
| `ingest_runs` | Pipeline log | `source`, `started_at`, `finished_at`, `status`, `stats` (jsonb), `error` |

### 3.2 Provenance and the "human wins" rule
`services.field_sources = { "<field>": { "source": "volunteer:<uid>" | "admin:<uid>" | "seed:bff" | "feed:<name>", "at": ISO } }`

When a feed reports a value for a field:
1. If the value is unchanged, do nothing (just bump `last_seen`).
2. If the field is in `locked_fields`, **or** its current source is human (`volunteer`/`admin`/`seed`), create a `change_request(source=feed:x)` for review.
3. Otherwise (the field is owned by that same feed or is empty), auto-apply, write a revision, and update `field_sources`.

New feed records are inserted with `status='unverified'`. Navigators can see them with a badge, but they're hidden in participant mode until approved.

## 4. Matching engine (`lib/match`)

Pure TypeScript and deterministic. The same code runs on the server and can run on the client later for offline use.

1. **Normalize:** lowercase, strip punctuation, fold accents, tokenize, and light-stem (`-ing`, `-s`, `-ed`).
2. **Crisis scan** (`lib/crisis`): regex phrase list (suicide, overdose, "kill myself", assault, …) → `crisis: {level, kinds}`.
3. **Lexicon pass:** for each `need_term`, match the phrase in normalized text (multi-word, with a ±1 token gap); single tokens fuzzy-match (Damerau-Levenshtein ≤ 1 for tokens ≥ 5 chars). A negation window ("no", "not", "don't need" within 3 tokens before) suppresses the match. Category score = 1 − Π(1 − weightᵢ).
4. **Full-text fallback:** if no category reaches 0.35, run a token-overlap search over service name, summary and field notes.
5. **Merge AI** (if enabled): `score = max(lexicon, 0.6·lexicon + 0.4·jev)` for categories where Jev's probability is ≥ 0.5.
6. **Service ranking:** `rank = catScore × (1 + 0.25·preferred + 0.15·openSoon + 0.1·verifiedRecent) − 0.3·unverified`. Hard filters: pets OK, no ID needed, open today.
7. **Group by tier** for display and plan building. Each result carries `reasons[]` (the matched phrases) for transparency.

## 5. AI layer (`lib/ai/jev.ts`), off by default
- **Gate:** `settings.ai_assist === true` and `TYPESAFE_API_KEY` is set.
- **Redaction** before sending: emails, phone numbers, street addresses, "my name is X", and DOB patterns are replaced with tokens.
- **Request:** `state` = redacted text. `questions` = one `noul` per category (`instructions`: "Does the person describe a need that <category> — <description> would help with?"), plus `crisis` (noul), `urgency` (choice: today/this week/longer term), and `language` (choice: en/es/other).
- **Timeout:** 4 s, then lexicon-only. Results are cached by a hash of the redacted text for 10 min.
- **Safety:** Jev answers only about our categories, so there is no free-text generation and nothing to hallucinate. Crisis = max(keyword detector, Jev noul ≥ 0.7).
- **Cost:** about 72 questions × ~150 tokens, roughly 11k input tokens per intake at $0.042/M ≈ $0.0005 per intake.
- **Voice:** keyboard dictation (works everywhere, including iOS home-screen apps) plus a Web Speech API mic button where supported. Jev takes text only.

## 6. Auth & authorization
- Better Auth `emailOTP`: user enters email, receives a 6-digit code (10-minute expiry), signs in or up. No passwords and no social providers.
- `role` defaults to `participant`. "Request volunteer access" sets `volunteer_status = requested`. An admin approves, which sets `role = volunteer`. Admins are bootstrapped via the `ADMIN_EMAILS` env var.
- Authorization is enforced in server actions with `requireRole('volunteer' | 'admin')`. Participant routes are gated by `settings.participant_mode`.

| Capability | Anonymous | Participant | Volunteer | Admin |
|---|---|---|---|---|
| Participant intake & plan (if mode on) | ✓ | ✓ | ✓ | ✓ |
| View shared plan link | ✓ | ✓ | ✓ | ✓ |
| Save own plans | | ✓ | ✓ | ✓ |
| Navigator workspace, internal notes, unverified services | | | ✓ | ✓ |
| Propose edits / new services / gaps | | | ✓ | ✓ |
| Approve edits, users, settings | | | | ✓ |

## 7. Routes

| Route | Who | What |
|---|---|---|
| `/` | all | Two doors: "I'm helping someone" / "I need help" |
| `/help` | participant mode | Intake → results by tier → plan |
| `/navigator` | volunteer | Intake + chips + dimensions + trees + plan builder |
| `/navigator/trees/[slug]` | volunteer | Decision-tree walker |
| `/plan` | all | Current basket → save / print / share |
| `/p/[token]` | all | Read-only plan, print layouts, QR |
| `/plans` | signed-in | My saved plans |
| `/services`, `/services/[id]` | volunteer | Directory and detail |
| `/services/new`, `/services/[id]/edit` | volunteer | Propose create/update |
| `/gaps` | volunteer | Gaps & follow-ups |
| `/admin` | admin | Review queue · volunteers · settings · sources |
| `/login` | all | Email-code sign-in |
| `/api/auth/[...all]` | — | Better Auth handler |

## 8. Ingestion (`scripts/ingest.ts`, `lib/ingest/*`)
Each connector implements `fetch(): Promise<FeedRecord[]>`, where a `FeedRecord` is `{ externalId, name, fields, categories }`. The runner:
1. Opens an `ingest_runs` row.
2. Matches records to services by `external_ids[source]`, then by normalized name plus a 100 m geo match.
3. Applies the provenance rule (§3.2).
4. Writes stats.

v1 connectors (from research memo 02):
- `bococ-dropboxes`: Boulder County ArcGIS, needle-disposal drop boxes
- `bococ-naloxone`: Boulder County ArcGIS, naloxone pharmacies
- `city-wifi`: City of Boulder, public Wi-Fi buildings
- `findtreatment`: SAMHSA FindTreatment.gov locator, within 10 mi of Boulder
- `allroads-guide`: watches the WordPress media API for a new Community Resource Guide PDF and opens a review item ("new street sheet published — check against records")

**Schedule:** `.github/workflows/ingest.yml` nightly at 09:17 UTC (02:17 MST), plus manual dispatch. It needs the `DATABASE_URL` secret.

## 9. Printing & sharing
- Print CSS has two layouts: **Letter** (default) and **Receipt** (`?layout=receipt`, 72 mm content width, monochrome, large phone numbers, QR at the end). The receipt layout is the template for the post-launch thermal path.
- PDF comes from the browser's "Save as PDF" on the print layout. It's zero-dependency and identical to the printout.
- Share token: 22-char base64url (128 bits) from `crypto.randomBytes(16)`. Plans contain no PII by design, and `for_label` is shown only to the owner unless they opt in to printing it.

## 10. Privacy & safety
- No location capture. No real-name fields. Nickname/initials only, with a UI hint saying so.
- `intake_text` is stored only on volunteer-saved plans, visible only to the owner, and deletable; it's never stored for anonymous plans.
- AI calls are redacted, and TypeSafe doesn't train on inputs (ZDR available for enterprise; to request).
- We never ingest encampment and SAMPS layers.
- Crisis panel copy explains 988 and BHCR as alternatives to a police response.

## 11. Environments & config

| Var | Purpose |
|---|---|
| `DATABASE_URL` | Neon connection string (unset → local PGlite at `.data/pglite`) |
| `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` | Auth |
| `RESEND_API_KEY`, `EMAIL_FROM` | Email codes (unset → codes logged to console) |
| `ADMIN_EMAILS` | Comma-separated bootstrap admins |
| `TYPESAFE_API_KEY` | Jev (unset → AI unavailable regardless of setting) |

**Deploy:** a Vercel project linked to the GitHub repo, with a Neon integration (preview branches per PR). `npm run db:migrate && npm run db:seed` runs on first deploy.
