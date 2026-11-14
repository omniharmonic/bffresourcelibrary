# PRD — BFF Resource Navigator

*Product Requirements Document · v1.0 · 2026-11-14*
*Prepared by Benjamin Life ([@omniharmonic](https://github.com/omniharmonic)) with Boulder Feet Forward (Libby Ogletree). Research: [`docs/research/`](research/README.md).*

**Working URL:** `navigator.boulderfeetforward.org`

---

## 1. Problem

People living unhoused in Boulder rarely arrive asking for a *list*. They arrive with a *problem*: "my tent got taken," "I can't get my ID," "I haven't eaten." Existing directories (211 Colorado, findhelp, printed street sheets) are list-first, update slowly, and leave out what makes a referral work: what it's actually like to go there, whether you can bring your dog, whether police will be there, which day it's really open. Most participants don't have a working phone (Libby's estimate is 20–30% do), many live with SUD, TBI or serious behavioral health conditions, and **paper is the preferred handoff**.

Boulder Feet Forward's peer navigators carry this knowledge in their heads and in Libby's prototype (111 resources, 72 categories, 9 decision trees). The goal is to make that knowledge live, shared, current, and easy to turn into a plan in the moment.

## 2. Vision

A 211/311-style navigator built around how unhoused people in Boulder actually live. Someone describes their situation in their own words. The system suggests services organized into a **support plan**:

1. **Right now:** where to get it today
2. **Next time:** how to solve it yourself next time
3. **Long term:** the stable supports that change the situation

The plan prints, saves, or travels as a link. Data comes in automatically from open sources and stays fresh. Trained volunteers add the field notes that make it trustworthy, and Libby and the admins approve what goes live.

## 3. Users & modes

| Role | Who | Access |
|---|---|---|
| **Participant** | Unhoused person on their own phone, library computer, or a friend's phone | **Participant mode**, which Libby/admins can switch on or off. No account required; optional email sign-in to save plans. |
| **Volunteer (navigator)** | Trained peer navigators at Days in the Park and outreach | Sign in by email code → request access → **Libby/admin approves**. Builds plans for others, saves them tagged by nickname, proposes edits. |
| **Admin** | Libby and delegated leads | Approves volunteers and edits, manages settings, gaps, sources, decision trees. |

**Mode governance:** both modes ship in v1. A global setting `participant_mode` (on/off, default **off** until Libby approves) controls whether the public self-serve path is reachable. While it's off, `/help` shows a gentle "talk to a BFF navigator" page with outreach times. A second setting, `ai_assist`, enables or disables the Jev layer separately.

## 4. Principles

1. **Problem-first, not list-first.** Free text, quick-need chips, and decision trees all lead to the same plan.
2. **Works without AI.** The keyword/lexicon matcher is the product. AI only improves it, and it can be switched off with no loss of core function.
3. **Field notes are the moat.** What to expect, pets, police, rules, barriers, and "last checked by a person on date X."
4. **Paper-first handoff.** Every plan prints cleanly in black and white, with phone numbers and hours, never just links.
5. **Do no harm.** Collect the minimum. No real names required, no location tracking, no encampment or "report a person" data. Crisis resources come first.
6. **Humans approve, machines maintain.** Automation proposes; Libby/admins dispose. A verified human edit is never silently overwritten by a feed.
7. **Accessible and calm.** BFF brand, Atkinson Hyperlegible, large tap targets, plain language, Spanish in the roadmap.

## 5. Core user stories

### Volunteer (field)
- **V1.** I type or dictate what the person said ("lost ID, needs food, has a dog") and see matched services grouped by tier, with the dog-friendly ones flagged.
- **V2.** I tap a need chip (Food, Shower, ID, Shelter, Phone charging, Medical, Crisis…) or a wellness dimension to browse.
- **V3.** I walk a decision tree (camping ticket, property taken, vital documents, medical, disability, …) and add the suggested services.
- **V4.** I add services to a plan, reorder them, add a personal note per item, and enter a nickname or initials for who it's for.
- **V5.** I print the plan, save a PDF, or show a QR/share link (anonymous, no PII).
- **V6.** I see all the plans I've made, search them by nickname or tag, and reopen or duplicate them.
- **V7.** When a service is wrong or missing, I propose an edit or a new service from my phone in under a minute.
- **V8.** I see "open now / opens at 3pm," pet policy, police presence, rules, and when a person last verified the record.

### Participant
- **P1.** I write (or speak, via my keyboard mic) what I'm dealing with, in my own words, and get a short plan.
- **P2.** I add or remove items and keep the plan as a link, a screenshot, or a printout. Signing in by email code saves it.
- **P3.** If I mention self-harm, overdose or violence, crisis options appear first, calmly.
- **P4.** I can open any plan link a navigator gave me, without an account.

### Admin (Libby)
- **A1.** I approve or reject volunteer access requests, and change roles.
- **A2.** I review a queue of proposed changes (from volunteers and from automated imports), see the diff, then approve, reject, or edit and approve.
- **A3.** I lock fields a person has verified so imports can't overwrite them.
- **A4.** I turn participant mode and AI assist on or off.
- **A5.** I track service gaps and follow-ups (title, ideas, owner, status).
- **A6.** I see each data source, when it last ran, and what it changed.

## 6. Functional requirements

### 6.1 Intake & matching
- **FR-1** Free-text intake (≥ 2,000 chars) with a dictation hint. A Web Speech API mic button appears where the browser supports it.
- **FR-2** Quick-need chips (about 12, with icons) and an Eight Dimensions browser, both mapped to categories.
- **FR-3** **Lexicon matcher:** a curated needs lexicon (plain English, slang, common Spanish) maps phrases to categories with weights. It includes phrase and fuzzy token matching and negation handling ("not hungry").
- **FR-4** **Ranking:** category match strength × tier fit × BFF-preferred × open-now/soon × verification recency × pet/ID/sobriety filters.
- **FR-5** **Crisis detection** (always on, keyword-based, no AI needed) surfaces 988, BHCR / Boulder crisis options, and 911 with an enforcement-aware explanation.
- **FR-6** **AI assist (Jev, optional):** sends redacted text plus typed questions (one yes/no per category, plus crisis, urgency and language) to TypeSafe Jev. It merges probabilities with lexicon scores. It can only pick from our categories, so it cannot invent services. It times out to lexicon-only after 4 s.
- **FR-7** **Results** are grouped by tier, with a "why this matched" chip, an add-to-plan button, and key facts (hours, phone, address, pets, police, rules).

### 6.2 Plans
- **FR-8** Plan basket persists across the session (local storage until saved).
- **FR-9** Plan view groups items by tier and shows a header (nickname/for, date, navigator first name optional), per-item note, hours, phone, address, and a short "what to expect."
- **FR-10** Print stylesheet for Letter/A4 and a narrow 80mm "receipt" layout, so the same page can feed a thermal printer post-launch.
- **FR-11** Anonymous share link `/p/{token}` (128-bit random token, no PII, optional expiry) with QR code.
- **FR-12** Volunteers save plans to their account with a nickname/initials and tags. Participants can save their own plans by signing in.

### 6.3 Services & wiki
- **FR-13** Service record (HSDS-aligned): name, organization, summary, how to access, field notes (shared), internal notes (volunteers only), phone, website, address/lat-lng, hours (text + structured), eligibility, pets, police, rules + link, categories, tier, preferred, status (active/temporary/inactive/unverified), date range for temporary/pop-up services, verification date and source.
- **FR-14** Volunteers **propose** create/update/archive through mobile-friendly forms. Admins approve or reject with a note. Every approved change writes a revision (full history and restore).
- **FR-15** Field-level **provenance and locks**: every field remembers its source (seed, volunteer, admin, or feed name) and date. Locked fields can't be changed by imports.
- **FR-16** Gaps & follow-ups board (from Libby's prototype).
- **FR-17** Decision trees stored as data (Libby's 9 seeded), rendered as step-through flows whose leaves link to categories and services.

### 6.4 Data pipeline
- **FR-18** Scheduled ingestion (GitHub Actions nightly) runs source connectors. Each run is logged.
- **FR-19** New records from feeds arrive as `unverified` and go to the review queue. Changes to unlocked, feed-owned fields auto-apply and are logged. Changes to human-owned or locked fields open a review item.
- **FR-20** Initial connectors: BFF seed (111) · All Roads Community Resource Guide watcher (flags new editions for review) · Boulder County ArcGIS (needle drop boxes, naloxone pharmacies, libraries) · City of Boulder ArcGIS (public Wi-Fi buildings) · SAMHSA FindTreatment.gov · HRSA health centers. 211 NDP is added once Mile High United Way grants permission.
- **FR-21** Optional enrichment (AI): suggested categories and plain-language summaries go to the review queue, never directly live.

### 6.5 Accounts
- **FR-22** Passwordless sign-in with a 6-digit email code (Resend). There are no passwords. Sessions last 30 days on a device.
- **FR-23** Roles are `participant` (default), `volunteer` (after approval), and `admin`.

## 7. Non-functional requirements
- **Performance:** first load under 2.5 s on 4G. Lexicon match under 150 ms server-side for 1,000 services.
- **Accessibility:** WCAG 2.2 AA; tap targets ≥ 44 px; body text ≥ 18 px; works at 320 px width.
- **Privacy:** no PII required anywhere. Nicknames only. AI calls get redacted text (phones, emails, names after "my name is"). No analytics beyond aggregate counts. Plans for participants are retained 12 months unless deleted.
- **Reliability:** if the AI provider fails, the app falls back to the lexicon matcher. If a feed fails, the last good data stays.
- **Cost:** about $0–25/month at launch (Vercel Hobby or sponsored, Neon free tier, Resend free tier, Jev at fractions of a cent per plan).

## 8. Out of scope for v1 (post-launch roadmap)
1. **Thermal receipt printing.** Pi print bridge or CloudPRNT printer, depending on the RegenHub printer model, plus 58/80 mm ESC/POS formatting with QR codes.
2. 211 National Data Platform connector (pending the MHUW data-sharing agreement).
3. Full Spanish UI and Spanish plan output.
4. Offline PWA mode for spotty park connectivity.
5. Visual decision-tree editor.
6. Map view, and walking distance from a chosen landmark (no GPS tracking).
7. Volunteer shift notes, and "tried it, didn't work" feedback loops on plan items.
8. SMS delivery of plan links.
9. Self-hosting option on RegenHub hardware.

## 9. Success metrics (first 90 days)
- Plans created per Days-in-the-Park event (target: ≥ 15)
- Share of plans printed or shared (target: ≥ 70%)
- Median time from first input to finished plan (target: ≤ 3 min)
- Services with a human verification in the last 90 days (target: ≥ 80% of active)
- Review queue median age (target: ≤ 7 days)
- Active approved volunteers (target: 10–20)

## 10. Open items (non-blocking)
- MHUW / 211 data-sharing reply ([draft email](outreach/mhuw-211-data-request.md)).
- The live encampment-report layer exposes requester addresses. Decide whether to notify the City (we will never ingest it).
- Coordinated Entry hours conflict across sources; a navigator should verify.
- Printer model, tablet platform, and park connectivity, for the post-launch printing work.
