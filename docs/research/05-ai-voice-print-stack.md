# 05 — AI, Voice, Printing & Platform Stack

**Project:** Boulder Feet Forward (BFF) resource library / support-plan app
**Scope:** Technical architecture research: LLM layer, voice, thermal printing, PDF/sharing, auth, editing/pipeline/PWA/i18n, privacy, cost
**Date researched:** 2026-11-14
**Status legend:** Facts with a link were checked against that source on the date above. **UNVERIFIED** means the claim comes from memory, a secondary source, or sources that disagree; confirm it before relying on it.

---

## 1. Summary / recommended stack

**Verdict on the presumed stack: keep Next.js (App Router) on Vercel with Neon Postgres. Change three things around it.**

1. **Do not use Vercel Cron for ingestion on Hobby.** Hobby crons run at most once a day with ±59 min precision, and functions max out at 300 s. Run ingestion in **GitHub Actions** on a schedule. It writes to Neon directly. ([Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing), [Vercel limits](https://vercel.com/docs/limits))
2. **The browser cannot print to a thermal printer on iPads/iPhones.** iOS Safari has no WebUSB, Web Bluetooth or Web Serial. Use a **cloud print queue** (a Postgres table) drained by a **Raspberry Pi print relay**, or by a Star printer with **CloudPRNT**. Any device, any browser can then print. Android Chrome can also print directly as a bonus path.
3. **Build search without AI first.** Use Postgres full-text search (English + Spanish configs, `unaccent`, `pg_trgm`), a volunteer-editable synonym table, and a client-side search index for offline use. Claude goes on top as an optional, switchable layer that can only pick from IDs our search returned.

| Layer | Recommendation | Why / alternative |
|---|---|---|
| Framework / hosting | Next.js 15/16 App Router on Vercel (Pro if the team qualifies; see §9) | Team already has accounts. Server actions + route handlers cover the API. |
| DB | Neon Postgres + Drizzle ORM | Branching makes preview DBs per PR easy. `pgvector` is available. Note: **`pg_search` is not available for new Neon projects since 2026-03-19** ([Neon pg_search doc](https://neon.com/docs/extensions/pg_search)). Use built-in `tsvector`, or Neon's `lakebase_text` BM25 (UNVERIFIED maturity). |
| Search (no-AI) | `tsvector` (english + spanish) + `unaccent` + `pg_trgm` fuzzy + `synonyms` table + category browse + decision trees as JSON | Works with AI off, is deterministic, and can be mirrored offline. |
| Offline search | Nightly services snapshot JSON + MiniSearch/FlexSearch index cached by the service worker | Full keyword search with no signal in the park. |
| LLM (optional) | Claude API, two-step structured-output pipeline. Default `claude-opus-5-5` (effort `low`) for plan composition. `claude-haiku-5-5` for need extraction/triage when cost or latency matters. Model choice is one env var. | Grounded: the model only returns service IDs from a candidate set, validated server-side. |
| Embeddings (optional, phase 2) | `pgvector` on Neon + Voyage `voyage-4-lite` (first 200M tokens free) for hybrid search | Keyword + synonyms will cover most of a corpus this size. Add vectors once there are real queries to evaluate. |
| Crisis detection | **Deterministic, local, always on** (EN/ES keyword/regex lists), plus an LLM `crisis` flag when AI is on | 988/911 surfaced first even with AI off or offline. |
| Voice | (1) OS keyboard dictation (iOS/Android mic key), (2) Web Speech API button where supported, (3) optional server transcription (`gpt-4o-mini-transcribe` or Deepgram Nova-3) behind a toggle | iOS Web Speech is unavailable in Home-Screen PWAs. Keyboard dictation is free, works everywhere and is often on-device. |
| Thermal printing | Print-job table in Neon → **Raspberry Pi relay** (USB to the partner's ESC/POS printer, on a hotspot) **or** Star CloudPRNT printer. Android-only direct path via WebUSB/Web Bluetooth + `@point-of-sale/receipt-printer-encoder`. Always show the QR on screen as a fallback. | Works on iPads. No mixed-content/self-signed-cert pain. |
| PDF | Print CSS + `window.print()` (Save as PDF), plus `@react-pdf/renderer` route for a downloadable PDF | No headless Chromium on Vercel. |
| Share links | Random 128-bit token (base62, ~22 chars), stored hashed, snapshot of service IDs only, 90-day default expiry, revocable, `noindex` | No PII in URL or page. |
| Auth | **Better Auth** (self-hosted in the app, Drizzle adapter on Neon) with **Email OTP** (6-digit code) + magic link + `admin` plugin for roles. Alternative: **Neon Auth** (managed Better Auth) for zero setup. | User records stay in our DB. OTP codes avoid "link opened in the wrong browser" problems on phones and PWAs. |
| Email | Resend (free: 3,000/mo, 100/day) | Upgrade to Pro (~$20/mo) if event days exceed 100 sign-ins. |
| Wiki editing | `services` + `service_revisions` (JSONB snapshots, status pending/approved/rejected, author, source), field-level provenance, review queue | Ingestion writes revisions too, so human edits are never silently overwritten. |
| Scheduled ingestion | GitHub Actions cron → TypeScript/Python scripts → Neon. Enrichment via Claude **Batch API** (50% off) with human review. | Free, 6 h jobs, logs. Inngest/Trigger.dev are overkill for day one. |
| PWA / offline | Serwist (`@serwist/next`) + IndexedDB drafts + manual retry queue | Safari lacks Background Sync. |
| i18n | `next-intl`, UI strings EN/ES. Content fields `*_es` (LLM-drafted, human-verified flag). | |

---

## 2. LLM layer

### 2.1 Models and pricing (verified 2026-11-14)

From [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing) and the [models overview](https://platform.claude.com/docs/en/about-claude/models/overview):

| Model | ID | Input $/MTok | Output $/MTok | Cache read | Batch (in/out) |
|---|---|---|---|---|---|
| Claude Opus 5.5 | `claude-opus-5-5` | $4.00 | $20.00 | $0.20 | $2 / $10 |
| Claude Sonnet 5.5 | `claude-sonnet-5-5` | $2.00 | $10.00 | $0.10 | $1 / $5 |
| Claude Haiku 5.5 (≤100K-token prompts) | `claude-haiku-5-5` | $0.10 | $0.50 | $0.01 | $0.05 / $0.25 |

API notes that matter for implementation (from the Claude API skill reference, current as of 2026-11):

- **Structured outputs:** `output_config: { format: ... }`. In TypeScript, `client.messages.parse({ ..., output_config: { format: zodOutputFormat(Schema) } })` from `@anthropic-ai/sdk/helpers/zod`. The deprecated `output_format` param should not be used.
- **Opus 5.5 / Sonnet 5.5:** forced `tool_choice: {type:"any"|"tool"}` returns HTTP 400. Use structured outputs (preferred here) or `auto` + `strict: true`. Thinking cannot be disabled on Opus 5.5. Control cost and latency with `output_config.effort` (`low` for this use, since the default is `medium`).
- **Refusals:** always check `stop_reason === "refusal"` before reading content. The server-side `fallbacks` parameter (beta `server-side-fallback-2026-07-01`, `fallbacks: "default"`) is available on Opus 5.5 / Sonnet 5.5.
- **Prompt caching:** put the frozen system prompt and taxonomy first with `cache_control`, and per-request content last.
- No assistant prefill on current models.

### 2.2 Recommended pipeline: "retrieve, then choose". Not a free-roaming agent.

```
[client] free text / dictation
   │ 1. Local crisis scan (regex EN/ES), always runs → show 988/911 banner immediately
   │ 2. Local PII redaction (names after "my name is", phones, emails, DOB, SSN, street addrs) → "[PHONE]" etc.
   ▼
[server /api/plan]
   3. (AI on) Claude call #1: EXTRACT → JSON {needs:[category enum], urgency, language, crisis_flags[], keywords[], constraints{has_pet, has_vehicle, family, accessibility, ...}}
      (AI off) keyword→category mapping via synonyms table + decision tree answers
   4. Postgres hybrid search per need → top N candidates (IDs + compact fields), filtered by open/active
   5. (AI on) Claude call #2: RANK & COMPOSE → JSON {items:[{service_id, need, why, next_step}], general_tips[]}
   6. Server validation: drop any service_id not in the candidate set. Render name/address/phone/hours
      FROM THE DB, never from model text. Crisis items pinned on top.
```

Why two structured calls instead of tool use:

- Deterministic and easy to test.
- One retrieval round-trip.
- Works with the same JSON contract when AI is off (step 3 and step 5 have keyword/rule fallbacks).
- Forced tool choice isn't available on the newest models anyway.

A tool-use loop (`search_services(query, category)`) is a reasonable phase-2 upgrade for vague requests. Validation in step 6 stays the same either way.

**Hallucination guardrails**

- The prompt says "Recommend only from `<candidates>`; if nothing fits, return an empty list and say so."
- Server-side ID whitelist.
- Contact details always come from the DB.
- Scraped service text goes into `<candidates>` as data. Treat it as untrusted, since it could contain prompt injection. Model output is only IDs plus short rationale strings, which are rendered as plain text.

**Do not** put dynamic candidate IDs into the JSON schema as an `enum`. Schemas are compiled and cached (up to 24 h), so per-request schemas lose that and leak data into the schema cache. Validate in code instead.

### 2.3 Crisis detection

- **Layer 1 (always on, offline-capable):** curated EN/ES lexicon covering suicide/self-harm, overdose ("OD", "fentanyl", "not breathing", "blue lips", "narcan"), medical emergencies, hypothermia/frostbite (relevant in Boulder winters), DV/assault, and danger to others. A match shows a non-dismissable top card:
  - **988** (call/text, Spanish option)
  - **911**
  - **Colorado Crisis Services** 1-844-493-8255 / text TALK to 38255 (**UNVERIFIED, confirm with BFF**)
  - naloxone guidance and where to get it locally
- **Layer 2 (AI on):** the extraction schema includes `crisis_flags` and `urgency`. The server ORs them with layer 1, and never lets the model *clear* a layer-1 flag.
- Do not auto-dial or auto-report. Present options and let the person choose. Given enforcement concerns, 911 is shown as an option, and 988 / mobile crisis responders are listed alongside it. Ask BFF whether Boulder's co-responder / alternative response program should be listed (UNVERIFIED that one exists currently).
- The UI must say that the app is not a crisis counselor.

### 2.4 PII minimization before the API

- Redact client-side before sending: phone, email, SSN/ID patterns, DOB patterns, street addresses, and "my name is X" / "me llamo X" patterns. Show the person the redacted text ("This is what will be sent").
- Never send volunteer nicknames, participant identifiers, account emails or location to Claude. The model needs only the redacted need text and candidate services.
- Do not log prompts and responses in our DB. Log only token counts, latency and model.
- **Retention at Anthropic:** API data is not used for training without express permission ([API & data retention](https://platform.claude.com/docs/en/manage-claude/api-and-data-retention)). Standard commercial retention applies ([commercial retention policy](https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data); exact window is **UNVERIFIED**, check the page).
- **Zero Data Retention (ZDR)** is available per organization on request via Anthropic sales. The Messages API is ZDR-eligible, and structured outputs is "Yes (qualified)": only the JSON schema is cached, for up to 24 h. **Batch API is not ZDR-eligible** (29-day retention), so use it only for public service data, never participant text. Apply for ZDR early, since approval for a small nonprofit is not guaranteed (UNVERIFIED). The design above minimizes what's sent regardless.
- Optional: `inference_geo: "us"` keeps inference in the US (1.1× price).

### 2.5 Cost per plan (estimate)

Assumptions:

- **Call #1:** ~2.5k input tokens (system + taxonomy, mostly cached) + ~300 tokens user text; ~400 output.
- **Call #2:** ~4k input (30 candidates × ~100 tokens + instructions); ~1.2k output including adaptive thinking at low effort.
- **Total:** ~7k input, ~1.6k output per plan, before caching.

| Configuration | Per plan | 500 plans/mo | 2,000 plans/mo |
|---|---|---|---|
| All Haiku 5.5 | ~$0.0015 | ~$0.75 | ~$3 |
| Haiku extract + Sonnet 5.5 compose | ~$0.02 | ~$10 | ~$40 |
| Haiku extract + Opus 5.5 compose (effort low) | ~$0.035–0.05 | ~$18–25 | ~$70–100 |
| All Opus 5.5 | ~$0.06 | ~$30 | ~$120 |

Prompt caching cuts repeated system-prompt input by ~95% on cache hits, so real costs land at the low end. Thinking token usage varies, so measure with `usage` on 20 real (synthetic) notes before choosing. **Recommendation:** ship Haiku-extract + Opus-compose behind env vars `LLM_EXTRACT_MODEL` / `LLM_PLAN_MODEL`. Drop to Sonnet or Haiku if bills or latency demand it.

### 2.6 Embeddings vs keyword

- Anthropic does not sell an embeddings model. Its docs point to Voyage AI. Voyage `voyage-4-lite` is ~$0.02/MTok, with the first 200M tokens free on v4 models ([Voyage pricing](https://docs.voyageai.com/docs/pricing)). A corpus of ~2,000 services × 300 tokens = 0.6M tokens, so effectively $0.
- **Phase 1 (today): keyword + synonyms + categories.** Human-language gaps like "somewhere to shower" → hygiene are better solved by a synonym table that volunteers edit and by the LLM extraction step, which maps free text to the category enum. That step *is* the semantic layer.
- **Phase 2:** add a `vector(1024)` column with `pgvector` HNSW and use reciprocal-rank fusion with `ts_rank`. Embed queries only when AI is on. Embeddings of participant text also count as PII-bearing payloads sent to a vendor; re-embed only service text where possible.

---

## 3. Voice

| Option | iOS Safari | Android Chrome | Offline | Spanish | Cost | Privacy |
|---|---|---|---|---|---|---|
| **OS keyboard dictation** (mic key on iOS keyboard / Gboard voice typing) | Yes, any text field | Yes | Often on-device on recent devices (UNVERIFIED per-device/language) | Yes | $0 | Best: no audio reaches us |
| **Web Speech API** (`webkitSpeechRecognition`) | *Partial* from iOS 14.5. Requires Siri enabled. **Not available in Home-Screen web apps or SFSafariViewController** ([caniuse](https://caniuse.com/speech-recognition)) | Yes | No. On-device `processLocally` ships on desktop Chrome only; **Android not supported** ([Blink intent thread](https://groups.google.com/a/chromium.org/g/blink-dev/c/P8P-x7AnC6I), [caniuse processLocally](https://caniuse.com/mdn-api_speechrecognition_processlocally)) | `lang="es-US"` | $0 | Audio goes to Apple/Google speech services (UNVERIFIED specifics) |
| **Server: OpenAI `gpt-4o-mini-transcribe` / `gpt-4o-transcribe`** | Yes (MediaRecorder upload) | Yes | No | Strong | ~$0.003 / ~$0.006 per min (token-billed; third-party estimates) | Audio to OpenAI. API data not used for training by default. ZDR by contract (UNVERIFIED for audio endpoints) |
| **Server: Deepgram Nova-3** | Yes | Yes | No | Yes, incl. EN↔ES code-switching ([Deepgram](https://deepgram.com/learn/deepgram-expands-nova-3-with-spanish-french-and-portuguese-support)) | ~$0.0043–0.0092/min depending on batch/streaming/multilingual (third-party; UNVERIFIED) | Enterprise ZDR via account team (UNVERIFIED) |
| **Server: AssemblyAI Universal** | Yes | Yes | No | Yes | ~$0.0025–0.006/min (sources disagree, UNVERIFIED) | Configurable retention ([AAI FAQ](https://www.assemblyai.com/docs/faq/how-long-does-aai-retain-data)) |

**Noisy outdoor accuracy:** server models (gpt-4o-transcribe, Nova-3) are generally more robust to wind and crowd noise than browser engines. No park-specific benchmarks were found (**UNVERIFIED**). Practical mitigations matter more than the vendor:

- push-to-talk
- holding the phone close
- a cheap clip-on lavalier for volunteer tablets
- always show the transcript in an editable box before submission

**Recommendation**

1. Default to a large textarea with the hint "Tap the 🎤 on your keyboard to speak" (EN/ES). Zero cost, zero integration, and works in the installed PWA.
2. Show an in-app mic button only when `SpeechRecognition || webkitSpeechRecognition` exists *and* the app is not running standalone on iOS.
3. Put server transcription behind an admin feature flag. It is the only path that sends raw voice (which can't be redacted) to a third party, so it needs explicit consent per use, never stores audio, and uses `gpt-4o-mini-transcribe` for cost. Cost at 500 one-minute notes/month is about $1.50.

---

## 4. Thermal receipt printing

### 4.1 What the browser can and can't do

| API | iOS/iPadOS Safari | Android Chrome | Desktop Chrome/Edge |
|---|---|---|---|
| WebUSB | **No**. Apple is opposed ([web-features](https://web-platform-dx.github.io/web-features-explorer/features/webusb)) | Yes | Yes |
| Web Bluetooth | **No** (third-party Bluefy browser / WebBLE extension only) | Yes | Yes |
| Web Serial | **No** | Recently added (Chrome 148, UNVERIFIED) | Yes |

Since every iOS browser uses WebKit, no direct-from-browser printing path exists on iPads/iPhones. Two vendor routes do work from any browser:

- **Network printer + vendor JS SDK** (Star WebPRNT, Epson ePOS SDK for JavaScript). The page sends HTTP(S) to `192.168.x.x`. Our app is on HTTPS, so the printer must also serve HTTPS, which means a self-signed cert generated on the printer and **installed and trusted on every iPad** ([Star mC-Print3 WebPRNT setup](https://star-m.jp/products/s_print/mcprint3/manual/en/settings/settingsWebPRNT.htm), [iPad cert install guide](https://support.getmolo.com/support/solutions/articles/13000096724-installing-mc-print-3-receipt-printer-certificate-on-an-ipad)). Epson TM-m30 certs are SHA-1 only and modern browsers may reject them ([Epson FAQ](https://www.epson.eu/en_EU/faq/KA-01080/contents)). Field reports describe ePOS + HTTPS + CORS failures. This route is fragile when a volunteer brings a new tablet.
- **Cloud polling.** The printer or a bridge polls *our* server for jobs over outbound HTTPS, so no mixed-content or certificate problems arise on the tablet. Star **CloudPRNT** is built into mC-Print3 / TSP100IV ([Star CloudPRNT](https://star-m.jp/products/s_print/mcprint3/manual/en/settings/settingsCloudPRNT.htm)). Epson's equivalent is "Server Direct Print" (UNVERIFIED for specific models).

### 4.2 Recommended: cloud print queue + Raspberry Pi relay

```
Tablet/phone (any browser) ──POST /api/print {plan_token, width}──▶ Vercel ──INSERT print_jobs──▶ Neon
                                                                                     ▲
Raspberry Pi (hotspot Wi-Fi) ──polls GET /api/print/next (device API key)──────────┘
   └─ USB/Bluetooth ─▶ partner's ESC/POS printer (58 or 80 mm)
```

- **Works with whatever printer the partner has** (USB or BT ESC/POS), from iPads, Android phones and laptops.
- Event setup: phone hotspot or travel router + Pi + printer + USB power bank. Pi 4/5 or Zero 2 W running a ~100-line Node or Python (`python-escpos`) service started by systemd.
- The job payload carries rendered **ESC/POS bytes** (built server-side with `@point-of-sale/receipt-printer-encoder`) or a structured plan the Pi formats. Use server-side encoding so both paths share one formatter.
- Jobs hold only the share token + service list, never PII. They are deleted after printing or after 24 h.
- Offline fallback (no internet at all): the Pi can also run a tiny local page at `http://bff-print.local` that tablets open directly as a top-level page (plain HTTP, no mixed content) to print a cached plan. Optional; build only if hotspot coverage is bad.
- If BFF buys a printer: a **Star mC-Print3 or TSP143IV with CloudPRNT** removes the Pi (the printer polls our endpoint directly). Price ~$300–450 (**UNVERIFIED**).

**Secondary path (Android, no hardware beyond the printer):**

- WebUSB / Web Bluetooth from Chrome using `@point-of-sale/webbluetooth-receipt-printer` / `webusb-receipt-printer` + the same encoder.
- Or the **RawBT** Android app as a print service/share target ([RawBT](https://alternativeto.net/software/rawbt-thermal-esc-pos-printer-driver/about)). RawBT's URL-scheme/intent format is **UNVERIFIED**; test on device.

**Always-available fallback:** a big on-screen QR code the participant scans with their own phone, plus "text me the link" (only if the person types their own number, which is never stored).

### 4.3 Formatting

| | 58 mm | 80 mm |
|---|---|---|
| Printable width | 384 dots (48 mm) | 576 dots (72 mm); some models 512 |
| Font A (12×24) chars/line | 32 | 48 (42 on some) |
| Font B (9×17) chars/line | 42 | 64 |
| QR (native `GS ( k`, model 2, ECC M) | module size 5–6 → ~25–30 mm for a short URL | module size 6–8 |

- Keep the receipt URL short (`bff.example/p/Ab3xY9...`, ~40 chars) so the QR stays low-density and scans on wrinkled thermal paper.
- Layout: BFF header → crisis numbers (always printed, bold) → each service (name bold, address, hours, phone, 1-line "why") → QR + "Scan to see updates" → issue date + "Info may change; call ahead." Bilingual or language-selected.
- **Spanish characters:** set the code page (CP858/CP1252/WPC1252) in the encoder. Cheap 58 mm printers vary, so test á é í ó ú ñ ¿ ¡ on the actual printer. Fall back to printing text as a raster image if accents garble.
- Library: `@point-of-sale/receipt-printer-encoder` v3.x (MIT; ESC/POS, StarPRNT, StarLine; `qrcode()`, `columns`, `image()`; [npm](https://npmjs.com/package/@point-of-sale/receipt-printer-encoder), [README](https://cdn.jsdelivr.net/npm/@point-of-sale/receipt-printer-encoder@3.0.3/README.md)). It supersedes `esc-pos-encoder`. Exact option names: check README.
- Not every cheap printer supports native QR. If not, render the QR to a bitmap (`qrcode` npm) and print it with `GS v 0`.

---

## 5. PDF & sharing

**PDF**

| Option | Pros | Cons | Use |
|---|---|---|---|
| Print stylesheet + `window.print()` | Zero deps. iOS/Android "Save as PDF" via share sheet. Same HTML as the plan page. | Browser-dependent pagination | **Primary** (also "Print" to AirPrint printers at partner offices) |
| `@react-pdf/renderer` in a route handler | Consistent file, small, runs in Node serverless, embeds QR (SVG/PNG from `qrcode`) | Separate layout components; custom fonts must be registered (Noto Sans covers Spanish) | **"Download PDF" button** |
| Server Chromium (`puppeteer-core` + `@sparticuz/chromium`) | Pixel-perfect HTML | ~50 MB+ function, cold starts, function size limits | Avoid |

**Anonymous share links**

- Token: `crypto.randomBytes(16)` → base62 (~22 chars, 128-bit). Store `sha256(token)` in `shared_plans.token_hash`, so a DB dump does not reveal live links.
- Contents: a **snapshot** of service IDs + need categories + the model's short rationale + language. No free text, nickname, email or location by default. Resolve service details live, so updates and closures show, with a "changed since printed" note.
- `expires_at` defaults to 90 days, with an owner-chosen option of 30 days to 1 year. Revoke button. Expired links show crisis numbers + "ask a BFF volunteer."
- Headers on `/p/*`: `X-Robots-Tag: noindex`, `Referrer-Policy: no-referrer`, `Cache-Control: private`, no third-party scripts or analytics. Rate-limit lookups.
- QR codes encode only the share URL.

---

## 6. Auth & email

| Option | Passwordless | Roles | Data location | Setup today | Notes |
|---|---|---|---|---|---|
| **Better Auth (self-hosted)** | Email OTP + Magic Link plugins | `admin` plugin (role field, ban, impersonate); custom roles via access control | **Our Neon DB** (Drizzle adapter) | ~1–2 h | **Recommended.** Full control of email templates via Resend. Sessions in our DB. |
| **Neon Auth** (managed Better Auth) | Email OTP, Magic Link ([Neon magic link](https://neon.com/docs/auth/guides/plugins/magic-link), [email OTP](https://neon.com/docs/auth/guides/plugins/email-otp)) | Admin plugin; Organization partial ([plugins](https://neon.com/docs/auth/guides/plugins), [roadmap](https://neon.com/docs/auth/roadmap)) | `neon_auth` schema in our Neon DB | <1 h (Neon MCP/console) | Good fallback if self-hosting stalls. Managed subset only. Email via Neon default or webhook to Resend. |
| Auth.js (NextAuth) | Email provider (magic link) | DIY | Our DB | ~2 h | No OTP out of the box. Roles are manual. Less momentum. |
| Clerk | Yes (codes + links) | Yes (metadata/orgs) | **Clerk's servers** | <1 h | Fastest UI, but participant emails live with a third party. Avoid for this population. |
| Supabase Auth | Yes | RLS-based | Supabase's Postgres | n/a | Conflicts with the Neon choice. |

**Recommended design**

- **Participants do not need an account.** Anonymous plan + share link + printed QR is the default "save." Optional sign-in lets them keep a list of their own plans. Many participants lack stable email access, so never gate core features on login.
- Sign-in with a **6-digit email code** (primary) and magic link (secondary). Codes work when the link would open in a different browser than the installed PWA, on shared devices, or when email is checked on another device.
- Roles in `user.role`: `participant` (default), `volunteer` (granted by admin; can create plans tagged with a **nickname/identifier** they choose; sees own and team plans per policy), and `admin` (approve edits, manage users, delete data). Enforce in server actions/route handlers (`requireRole('volunteer')`). Add Postgres RLS later.
- Volunteer onboarding: an admin invites by email → role set on first sign-in. Disable open self-registration for the volunteer role.
- **Email:** Resend free tier is 3,000/mo and **100/day** ([Resend pricing](https://resend.com/docs/knowledge-base/what-is-resend-pricing)). A busy park day could exceed 100 OTPs, so budget Pro (~$20/mo, UNVERIFIED current price). Use a verified sending domain (SPF/DKIM). Keep email bodies free of plan content ("Your sign-in code is 123456").

---

## 7. Editing, pipeline, PWA, i18n

### 7.1 Wiki-style editing with history and moderation

```
services(id, slug, name, name_es, description, description_es, categories[], address, geo_area, phone, url,
         hours jsonb, eligibility jsonb, languages[], status, verified_at, field_provenance jsonb, search tsvector, ...)
service_revisions(id, service_id, data jsonb, diff jsonb, author_id | source_id, kind: human|ingest|ai_enrich,
                  status: pending|approved|rejected, reviewer_id, note, created_at)
synonyms(term, lang, category_slug | expands_to[])
```

- Volunteers **propose** edits, which create a pending revision. Admins/trusted reviewers approve, and approval applies the revision to `services`. Optionally auto-approve low-risk fields (hours, phone) for trusted volunteers.
- History page per service: list revisions with field-level diffs (simple per-field compare; `jsondiffpatch` if needed). Revert = new revision copying old data.
- `field_provenance` records who or what set each field last. Ingestion never overwrites a field whose last setter was human unless the source value changed. Conflicts become pending revisions for review.
- A "Report a problem" button (anonymous allowed) creates a lightweight flag, not a revision.

### 7.2 Scheduled ingestion and enrichment

| Option | Fit |
|---|---|
| **GitHub Actions `schedule:`** | **Recommended.** Free for public repos (private: included minutes), jobs up to 6 h, logs and retries via re-run, secrets store. Scripts live in the repo (`/pipeline`). |
| Vercel Cron | Hobby: once/day, ±59 min, 300 s max function. Pro: per-minute, 800 s max ([limits](https://vercel.com/docs/limits)). Fine for small "refresh snapshot" tasks, not scraping. |
| Inngest / Trigger.dev | Durable steps, fan-out, retries. Worth it later if the pipeline grows. Extra vendor and keys. |

Pipeline steps:

1. fetch sources (APIs/CSV/pages)
2. normalize to the service schema
3. dedupe (name + address trigram similarity)
4. diff against current
5. write `ingest` revisions (auto-approve new records from trusted structured sources; queue changes to human-edited fields)
6. enrich via Claude **Batch API** (50% off): category tags, eligibility extraction, hours normalization, Spanish drafts. These become `ai_enrich` revisions marked "needs human check" until approved.
7. rebuild the offline snapshot JSON + search index and upload to Vercel Blob/static.

Public data only, so Batch's non-ZDR status is acceptable.

### 7.3 PWA / offline

- **Serwist** (`@serwist/next`, the maintained next-pwa successor; [Serwist docs](https://serwist.pages.dev/docs/next/turbo), [LogRocket guide](https://blog.logrocket.com/nextjs-16-pwa-offline-support/)). Precache the app shell. Stale-while-revalidate the services snapshot (~1–3 MB JSON) and search index. Cache crisis/hotline page permanently.
- Offline mode = keyword search + category browse + decision trees + build plan locally + show QR for a *local* plan (encode the service IDs in the URL fragment, e.g. `/p#v1:12,45,88`, so it works with no server write) + queue "save/share" for later.
- Drafts in IndexedDB (`idb`). Safari has no Background Sync, so retry on the `online` event and on app open.
- Show a clear "Offline: AI and voice-to-server unavailable" banner. Keyboard dictation still works.
- iOS caveat: installed PWAs can lose storage after weeks unused (**UNVERIFIED** current policy). Treat the cache as rebuildable.

### 7.4 i18n

- `next-intl` with `/en` and `/es` (or cookie-based). Default from `Accept-Language`, with a one-tap toggle on every screen.
- Content: `*_es` columns + `es_verified` boolean. Show machine translations with a small "auto-translated" label until verified.
- Search: index both `to_tsvector('english', ...)` and `to_tsvector('spanish', unaccent(...))`, and query both. Synonym table per language (e.g., "comida", "despensa" → food).
- Claude prompts: "Respond in {detected or chosen language}". Extraction returns `language`.
- Receipts and PDFs print in the chosen language. Crisis lines are always bilingual.

---

## 8. Privacy & safety (population that may face enforcement)

**Principles:** collect the minimum, keep it briefly, make the default anonymous, never track location, and assume any stored data can be subpoenaed or breached.

**Do NOT store**

- legal names, DOB, SSN/ID numbers
- immigration status, criminal/warrant history, substance use details
- medical diagnoses
- precise location or GPS, campsite descriptions, photos of people or camps
- raw audio, raw free-text notes (beyond a short-lived draft)
- IP addresses or device fingerprints in app tables
- third-party analytics/ad pixels, session replay

**Store (minimum)**

- plan = categories + service IDs + language + created_at + expiry
- optional volunteer-chosen **nickname/identifier** with a UI warning: "Don't use legal names, birthdays or descriptions."
- account emails for users who opt in
- revision authorship for volunteers/admins

**Location:** no geolocation by default. An optional "near me" button calls `getCurrentPosition` once, uses it client-side to sort results, and never sends or stores it. Server-side filtering uses a coarse area picker (e.g., "Downtown / North Boulder / Longmont"), never coordinates.

**Free text:** redact client-side. Send to the LLM only with AI on and the person's consent. Never persist raw text. If volunteers want case notes, that's a different product with its own legal review; don't build it today.

**Retention defaults**

- local drafts: 7 days
- anonymous shared plans: 90 days
- print jobs: 24 h
- volunteer-tagged plans: 12 months, then auto-delete unless renewed
- logs: Vercel/host default, with app-level logging free of PII
- "Delete all my data" for signed-in users; admin bulk purge by nickname

**Security**

- Neon encryption at rest + TLS
- least-privilege DB roles (app vs pipeline)
- secrets in Vercel/GitHub env
- rate limiting on OTP and share lookups
- CSP without third-party script hosts
- dependency pinning

**Consent language (draft, needs BFF/legal review)**

> **EN:** "This tool helps find services. We don't ask for your name and we don't track where you are. If you turn on 'Smart help', what you type (with phone numbers and names removed) is sent to an AI service to suggest options; it isn't used to train AI. Your plan is saved under a private link for 90 days unless you delete it sooner. If you're in danger right now, call or text 988, or call 911."
>
> **ES:** "Esta herramienta ayuda a encontrar servicios. No pedimos su nombre y no rastreamos su ubicación. Si activa la 'Ayuda inteligente', lo que escriba (sin números de teléfono ni nombres) se envía a un servicio de IA para sugerir opciones; no se usa para entrenar la IA. Su plan se guarda en un enlace privado durante 90 días, a menos que lo borre antes. Si está en peligro ahora mismo, llame o envíe un mensaje de texto al 988, o llame al 911."

Volunteer-side consent: before tagging a plan with a nickname, the volunteer confirms the participant agreed verbally. Record a boolean, not a signature.

**AI-specific safety:** the AI is advisory. Every recommendation is a DB record with "call ahead to confirm." No eligibility determinations ("you qualify for X") are generated by the model. The system prompt forbids legal and medical advice beyond referral.

---

## 9. Cost estimate (monthly, small-scale: ~500 plans, ~20 volunteers)

| Item | Low | Likely | Notes |
|---|---|---|---|
| Vercel | $0 (Hobby) | $20 (Pro, 1 seat) | Hobby is for personal/non-commercial use. Confirm whether nonprofit use qualifies (**UNVERIFIED**). Pro adds per-minute crons and 800 s functions. Vercel has had nonprofit/OSS sponsorship programs (UNVERIFIED current). |
| Neon | $0 (Free: 100 CU-h/project, 0.5–1 GB storage) | $5–20 (Launch usage-based) | Free plan suspends compute when limits are hit ([Neon pricing](https://neon.com/pricing), [changelog](https://neon.com/docs/changelog/2026-10-02)). Storage figure varies by source. |
| Claude API | ~$1 (Haiku only) | $10–25 (Haiku extract + Sonnet/Opus compose) | §2.5. Plus pipeline enrichment via Batch: one-off ~$1–5 for 2,000 services. |
| Embeddings (Voyage) | $0 | $0 | Within free 200M tokens. |
| Transcription | $0 (keyboard/Web Speech) | ~$2 | Only if server STT is enabled. |
| Resend | $0 | $20 | 100/day free cap. |
| GitHub Actions | $0 | $0 | |
| **Recurring total** | **~$1** | **~$65–90** | |
| Hardware (one-time) | ~$40 (58 mm BT printer if partner's unavailable) | ~$150–200 (Pi 5 + case + SD + power bank + travel router) or ~$300–450 (Star CloudPRNT printer, UNVERIFIED) | Plus thermal paper ~$1–2/roll. |

Check **Claude for Nonprofits** and other vendor nonprofit discounts. Eligibility and API credit availability are **UNVERIFIED**.

---

## 10. Open questions

1. **Printer:**
   - What exact model does the partner have?
   - Is it 58 or 80 mm?
   - What interfaces does it offer (USB / Bluetooth / Wi-Fi / Ethernet)?
   - Does it support native QR (`GS ( k`)?
   - Which code pages does it support?
   - May we leave a Pi attached to it on event days?
2. **Connectivity at Days in the Park:** is there cell coverage for a hotspot? Who brings it? This decides whether the Pi local-offline mode is needed.
3. **Devices:** iPads vs Android tablets for volunteers? (This decides whether the Android direct-print path is worth building.)
4. **Volume:** plans per event and per month, and peak sign-ins per day (Resend 100/day cap).
5. **Accounts for participants:** does BFF want them at all in v1, or only anonymous links + volunteer accounts?
6. **Volunteer data policy:** who can see plans tagged by other volunteers? Is retention of 12 months acceptable? Any partner data-sharing agreements?
7. **Anthropic ZDR:** will BFF request it? Who is the contact? Is AI on by default for participants or volunteer-only?
8. **Crisis resources:** confirm the Boulder/Colorado numbers and whether to list alternative-response programs. Ask how BFF wants 911 presented given enforcement concerns.
9. **Vercel plan:** does BFF qualify for Hobby (non-commercial), a sponsorship, or need Pro?
10. **Data sources and licensing:** which directories (211 Colorado, county/city lists, partner spreadsheets) may be ingested, at what frequency, and with what terms of use?
11. **Legal review** of consent text, retention and subpoena-response policy.

---

## 11. Sources

**Anthropic / Claude**
- Pricing: https://platform.claude.com/docs/en/about-claude/pricing
- Models overview: https://platform.claude.com/docs/en/about-claude/models/overview
- API & data retention (ZDR feature eligibility table): https://platform.claude.com/docs/en/manage-claude/api-and-data-retention
- Commercial retention policy: https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data
- Structured outputs: https://platform.claude.com/docs/en/build-with-claude/structured-outputs
- Prompt caching: https://platform.claude.com/docs/en/build-with-claude/prompt-caching
- Batch processing: https://platform.claude.com/docs/en/build-with-claude/batch-processing

**Embeddings / search**
- Voyage pricing: https://docs.voyageai.com/docs/pricing
- Neon pg_search (deprecated for new projects): https://neon.com/docs/extensions/pg_search
- Neon pricing: https://neon.com/pricing ; changelog 2026-10-02: https://neon.com/docs/changelog/2026-10-02

**Voice**
- caniuse Speech Recognition: https://caniuse.com/speech-recognition
- caniuse processLocally: https://caniuse.com/mdn-api_speechrecognition_processlocally
- MDN processLocally: https://developer.mozilla.org/docs/Web/API/SpeechRecognition/processLocally
- Blink on-device Web Speech thread: https://groups.google.com/a/chromium.org/g/blink-dev/c/P8P-x7AnC6I
- WebKit bug (WKWebView speech): https://bugs.webkit.org/show_bug.cgi?id=239816
- Deepgram Nova-3 Spanish: https://deepgram.com/learn/deepgram-expands-nova-3-with-spanish-french-and-portuguese-support
- Deepgram models: https://developers.deepgram.com/docs/models-overview
- AssemblyAI retention FAQ: https://www.assemblyai.com/docs/faq/how-long-does-aai-retain-data
- STT price comparisons (third-party, UNVERIFIED): https://convertaudiototext.com/blog/speech-to-text-api-pricing-2026 , https://soniox.com/compare/stt/pricing

**Printing**
- WebUSB status: https://web-platform-dx.github.io/web-features-explorer/features/webusb
- Web Serial support (third-party): https://www.testmuai.com/web-technologies/web-serial/
- ReceiptPrinterEncoder: https://npmjs.com/package/@point-of-sale/receipt-printer-encoder ; README: https://cdn.jsdelivr.net/npm/@point-of-sale/receipt-printer-encoder@3.0.3/README.md
- Star WebPRNT (mC-Print3): https://star-m.jp/products/s_print/mcprint3/manual/en/settings/settingsWebPRNT.htm
- Star CloudPRNT (mC-Print3): https://star-m.jp/products/s_print/mcprint3/manual/en/settings/settingsCloudPRNT.htm
- Star WebPRNT manual: https://star-m.jp/products/s_print/sdk/webprnt/manual/en/_sampleProgram.htm
- Star browser printing on iOS/Android: https://info.starmicronics.com/solutions-for-printing-from-web-browser-based-applications-on-ios-android-and-windows
- iPad cert install (mC-Print3): https://support.getmolo.com/support/solutions/articles/13000096724-installing-mc-print-3-receipt-printer-certificate-on-an-ipad
- Epson TM cert SHA-1 FAQ: https://www.epson.eu/en_EU/faq/KA-01080/contents
- RawBT: https://alternativeto.net/software/rawbt-thermal-esc-pos-printer-driver/about ; Virtual POS printer: https://github.com/402d/Virtual_POS_printer

**Platform**
- Vercel limits: https://vercel.com/docs/limits
- Vercel cron usage & pricing: https://vercel.com/docs/cron-jobs/usage-and-pricing
- Neon Auth plugins: https://neon.com/docs/auth/guides/plugins ; magic link: https://neon.com/docs/auth/guides/plugins/magic-link ; email OTP: https://neon.com/docs/auth/guides/plugins/email-otp ; roadmap: https://neon.com/docs/auth/roadmap
- Better Auth setup examples (third-party): https://makerkit.dev/docs/nextjs-drizzle/better-auth/auth-methods
- Resend pricing: https://resend.com/docs/knowledge-base/what-is-resend-pricing ; https://resend.com/pricing
- Serwist + Next.js: https://serwist.pages.dev/docs/next/turbo ; https://blog.logrocket.com/nextjs-16-pwa-offline-support/
