# BFF Navigator

A resource navigator for **Boulder Feet Forward**'s street outreach. Someone describes what's going on in their own words, by typing or by dictating. The app suggests services grouped into a **support plan**:

1. **Right now** — where to get it today
2. **Next time** — how to get it yourself next time
3. **Long term** — the stable supports

Plans print (full-page or receipt width), save as PDF, and share as an anonymous link with a QR code. Trained volunteers keep the data honest with field notes. Libby and the admins approve every change. Nightly imports from open data keep places current.

*Built by Benjamin Life ([@omniharmonic](https://github.com/omniharmonic)) with Boulder Feet Forward.*

- **Planning docs:** [PRD](docs/PRD.md) · [Architecture](docs/ARCHITECTURE.md) · [Implementation plan](docs/IMPLEMENTATION-PLAN.md) · [Research](docs/research/README.md) · [211 data request draft](docs/outreach/mhuw-211-data-request.md)

## What's in v1

| Area | Details |
|---|---|
| **Navigator** (`/navigator`) | Free-text or voice intake, 16 quick-need buttons, filters (open today, pets OK, no ID needed), Libby's Eight Dimensions rubric, results by tier, “+ Add” to plan |
| **Participant mode** (`/help`) | Same finder with simpler copy and no account required. **Off by default**; an admin switches it on in Admin → Settings |
| **Crisis safety** | Keyword crisis detection runs on every search, even with AI off. 988, the 24/7 walk-in center, SPAN, and 911 (with a Good Samaritan note) are shown first |
| **Plans** | Basket → notes per step → save under a nickname and tags (volunteers) → `/p/<token>` with QR code, Letter or Receipt print layout, and Share |
| **Decision trees** (`/trees`) | Libby's 9 trees (camping ticket, property taken, vital documents, medical, …); leaves link to matching services |
| **Wiki** (`/services`) | Directory, detail with per-field provenance and history, “I checked this today,” and suggest-edit / add-service forms that go to review |
| **Admin** (`/admin`) | Review queue with diffs (approve/reject, bulk by source), volunteer approvals and roles, settings (participant mode, AI assist), import log, field locks |
| **Gaps** (`/gaps`) | Service gaps and follow-ups board |
| **Imports** | Boulder County needle drop boxes and naloxone pharmacies, City of Boulder public Wi-Fi, SAMHSA FindTreatment.gov, and an All Roads street-sheet watcher. Runs nightly via GitHub Actions |
| **AI assist** (optional) | TypeSafe **Jev** classifies free text against *our* categories only (yes/no per category) and merges with the lexicon. Text is redacted first. Off unless an admin enables it and `TYPESAFE_API_KEY` is set |

**Matching without AI:** a 1,969-phrase needs lexicon (English, Spanish, street slang) → 73 categories, with fuzzy matching, negation handling ("not hungry"), and ranking by BFF-preferred, open-soon, and recently verified.

**Edits never get silently overwritten by imports:** every field remembers where it came from. Imports update only fields they own. A change to anything a person entered or locked goes to the review queue.

## Run it locally

```bash
npm install
```

```bash
cp .env.example .env.local
```

Set `ADMIN_EMAILS` to your email in `.env.local`. For `DATABASE_URL`, either:
- leave it empty to use an embedded database in `.data/pglite` (single process only: stop `npm run dev` before running scripts), or
- point it at any Postgres, e.g. `postgres://postgres@localhost:5432/bff` (recommended; Docker or Homebrew), or a Neon dev branch.

Scripts read `DATABASE_URL` from your shell, so `export` it before running them.

```bash
npm run db:migrate && npm run db:seed
```

```bash
npm run ingest
```

```bash
npm run dev
```

Open http://localhost:3000 and sign in with your admin email. Without `RESEND_API_KEY`, **the 6-digit code is printed in the terminal**.

```bash
npm test
```

**End-to-end suite** (103 checks: access control, auth, matching, crisis, plans, trees, wiki, volunteer lifecycle, review queue, imports, participant mode, gaps, responsive layout). It reads sign-in codes straight from the database, only touches records prefixed `E2E`, and cleans up after itself. The server must have `e2e-admin@example.org` in `ADMIN_EMAILS`.

```bash
BASE_URL=https://your-deployment DATABASE_URL=postgres://... node tests/e2e/e2e.mjs
```

## Deploy (Vercel + Neon)

1. Create a Neon project and copy its pooled connection string.
2. Import this repo into Vercel and set these environment variables:
   - `DATABASE_URL` (Neon)
   - `BETTER_AUTH_SECRET` (long random string)
   - `BETTER_AUTH_URL=https://navigator.boulderfeetforward.org`
   - `ADMIN_EMAILS` (Libby + you)
   - `RESEND_API_KEY` and `EMAIL_FROM` (verify the domain in Resend)
   - optional `TYPESAFE_API_KEY`
3. Run `npm run db:migrate && npm run db:seed` once against Neon, from your machine with `DATABASE_URL` set.
4. Add the GitHub secret `DATABASE_URL` so the nightly **Nightly data ingest** workflow can run. Trigger it once by hand from the Actions tab.
5. Add `navigator.boulderfeetforward.org` as a Vercel domain, and create the CNAME `navigator → cname.vercel-dns.com` at the DNS host (Squarespace).

## Project layout

```
app/                Next.js routes (navigator, help, plan, p/[token], services, trees, gaps, admin, login)
components/         Finder, plan basket, service cards, tree walker, forms
lib/match           Lexicon matcher + ranking (pure, tested)
lib/hours.ts        Free-text hours → weekly schedule, open-now (America/Denver)
lib/crisis.ts       Crisis detection · lib/redact.ts PII redaction before AI
lib/ai/jev.ts       TypeSafe Jev client (optional)
lib/provenance.ts   "Human wins" rule for imports
lib/ingest/         Connectors + runner
lib/db/schema.ts    Drizzle schema (HSDS-aligned)
data/seed/          Libby's 111 resources, 73 categories, 9 trees, lexicon, research review proposals
scripts/            migrate, seed, ingest
docs/               PRD, architecture, plan, research
```

## Before launch: decisions for BFF
- Confirm the crisis numbers in `lib/crisis-lines.ts`.
- Work through the review queue: 52 research suggestions (32 missing providers, 20 corrections) and about 90 imported places.
- Coordinated Entry hours conflict across official sources; a navigator should call to confirm.
- Send the [211 data request](docs/outreach/mhuw-211-data-request.md).
- Post-launch: thermal receipt printing (the Receipt layout is already the template), Spanish UI, offline mode.
