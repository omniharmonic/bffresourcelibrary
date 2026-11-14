# Implementation Plan — BFF Resource Navigator

*v1.0 · 2026-11-14 · Benjamin Life ([@omniharmonic](https://github.com/omniharmonic))*
*See [PRD.md](PRD.md) and [ARCHITECTURE.md](ARCHITECTURE.md).*

## Phase 0: Foundations (today)
- [ ] Scaffold Next.js 16 + TypeScript, BFF design tokens, layout, and nav
- [ ] Drizzle schema (§3 of the architecture doc), with the PGlite/Neon switch and migrations
- [ ] Seed: 8 dimensions, 72 categories with tiers, Libby's 111 resources, 9 decision trees, gaps/follow-ups
- [ ] Needs lexicon (English, slang, starter Spanish) for every category
- [ ] Unit tests for the matcher, crisis detector, provenance resolver, and redaction

## Phase 1: Navigator MVP (today)
- [ ] Email-code auth (Better Auth + Resend/console), roles, admin bootstrap
- [ ] `/navigator`: intake with mic hint → tiered results → add-to-plan; chips; dimension browser
- [ ] Decision-tree walker
- [ ] Plan basket → `/plan` → save (volunteer: nickname and tags) → `/p/[token]` with QR, Letter and Receipt print layouts
- [ ] `/plans` list
- [ ] Service directory and detail (open-now, pets, police, rules, verification badge)

## Phase 2: Wiki & governance (today)
- [ ] Propose create/update/archive forms → `change_requests`
- [ ] `/admin` review queue with diff → approve (writes a revision and field sources) or reject
- [ ] Volunteer access requests and approvals; role management
- [ ] Settings: `participant_mode`, `ai_assist`
- [ ] Field locks
- [ ] Gaps & follow-ups board

## Phase 3: Participant mode & AI (today)
- [ ] `/help`: gated by setting; simple intake, chips, tiered plan, share/print, optional sign-in to save
- [ ] Crisis panel (always on)
- [ ] Jev connector with redaction, timeout and cache; merges with the lexicon; admin toggle

## Phase 4: Pipeline (today → this week)
- [ ] Ingest runner, provenance rule, `ingest_runs` log
- [ ] Connectors: Boulder County drop boxes and naloxone, City Wi-Fi, FindTreatment.gov, All Roads guide watcher
- [ ] GitHub Actions nightly workflow
- [ ] Seed additions from research memo 03 (about 20 missing providers) entered as **unverified** change requests for Libby's review

## Phase 5: Launch (this week)
- [ ] Provision Neon project and Vercel project; set env vars; connect `navigator.boulderfeetforward.org` (DNS CNAME at Squarespace)
- [ ] Resend domain verification for `boulderfeetforward.org`
- [ ] TypeSafe API key; Libby decides on AI assist
- [ ] Bootstrap Libby as admin; walk through the review queue together
- [ ] Send the MHUW 211 data request ([draft](outreach/mhuw-211-data-request.md))
- [ ] Field test at a Days in the Park event; collect feedback

## Post-launch roadmap
1. **Thermal receipt printing.** Confirm the RegenHub printer model, width, and interfaces → Android direct print (Web Bluetooth/USB + ESC/POS) or a Raspberry Pi print bridge draining a `print_jobs` table; a Star CloudPRNT printer as an alternative. Reuse the Receipt print layout.
2. 211 NDP connector (delta export) once the agreement is signed.
3. Spanish UI and plans; grow the bilingual lexicon from real intake phrases (with consent).
4. Offline PWA: cache the service snapshot and lexicon, and queue plan saves.
5. Visual decision-tree editor; "tried it, didn't work" item feedback.
6. Landmark-based distance ("near Central Park") without GPS.
7. AI enrichment suggestions (summaries, category tags) into the review queue.
8. Optional self-hosting on RegenHub hardware.

## Definition of done (v1)
- A volunteer can sign in on a phone, turn a spoken or typed problem into a tiered plan, and print or share it in under 3 minutes.
- Libby can approve volunteers, approve or reject edits, and toggle participant mode and AI.
- With AI off, the app is fully functional.
- The nightly ingest runs green and its changes land in the review queue.
- Tests pass; the app builds on Vercel.
