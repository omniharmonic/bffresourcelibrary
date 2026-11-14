# 00 — Project Context (from Benjamin's brief, Libby's mockup, and the Nov 5 meeting)

*Prepared by Benjamin Life ([@omniharmonic](https://github.com/omniharmonic)), 2026-11-14.*

## Sources
- Benjamin's brief (this session, 2026-11-14)
- Libby Ogletree's static HTML mockup → `reference/libby-mockup-index.html` (v3.0, "Resource Database · Meeting people where they are")
- Meeting: *Benjamin x Boulder Feet Forward*, 2026-11-05 (Fireflies transcript in Parachute)
- BFF site design system (OpenSpace site `Boulder Feet Forward`, https://omniharmonic.github.io/boulder-feet-forward/)

## What Libby said she needs (Nov 5)
- **Problem-first, not list-first.** "People don't come up and say 'give me a list.' They describe a problem — it's troubleshooting."
- **Three tiers of help** for every need:
  1. *Right now* — where can I get this immediately?
  2. *Next time* — how can I solve this myself next time?
  3. *Long term* — what stable supports exist?
- **Field notes make or break it.** What is it actually like to go there? Can I bring my pet? Will police be there? What barriers will I hit? 211 Colorado "doesn't update very often" and lacks this.
- **Navigator tool, not a public directory** (her framing): used by trained resource navigators staffing meal-in-the-park events; information comes *from a person*. Many participants live with SUD, recurring TBI, or severe behavioral health conditions, so a raw list doesn't work.
- **Only ~20–30% of participants have phones** (lost, stolen, broken). **Paper is the preferred handoff.** Receipt printer was her "pie in the sky."
- **"Add to plan"** (basket-style), then "My plan" → print.
- **Wiki-like**: trained volunteers get logins after training; they can add resources and field notes; record "go try this → it didn't work" feedback.
- **Service gaps & follow-ups** tracked alongside resources (who's working on it).
- ~**20 users max** initially. Includes tiny things too (where to fill a water bottle, charge a device).
- Training program (trauma-informed care, motivational interviewing) goes hand in hand — tech alone isn't useful.

Benjamin's proposal at the time: separate dynamic app on a **subdomain** of the static BFF site; role permissions (propose → approve, admin, field-level edit rights); possible self-hosting on RegenHub hardware.

## What Benjamin added (Nov 14 brief)
- Natural-language (typed or voice) needs intake → recommended services → customized **support plan**.
- AI optional ("don't bake it in too much"); must be fully intuitive without it.
- Auto-ingesting, auto-enriching database fed by 211 Colorado, Boulder open data/311, etc.; volunteers prune & fine-tune.
- A self-serve path for unhoused people with phones (natural language in, plan out).
- Passwordless email sign-on; participant vs volunteer roles; volunteers save many plans tagged by who they spoke with; anonymous share links; PDF; thermal receipt printing at Days in the Park.
- Wiki-style back end (forms + desktop editor) with automation doing most of the upkeep.
- BFF branding.

> **Tension to resolve:** Libby framed the tool as *navigator-only / not public*; Benjamin's brief adds a *participant self-serve* mode. See open questions.

## Libby's mockup — what already exists
- 111 resources; Eight Dimensions of Wellness → ~60 categories (Physical, Social, Financial, Environmental, Intellectual, Occupational, Emotional, Spiritual), each dimension split into 3 tier groups.
- Record fields: `name, categories[], summary, access, notes (field notes), phone, url, status (verification provenance), petAccess, verified, preferred (★ BFF preferred), rules, rulesUrl, eventTime, eventDay, police`.
- Views: Wellness Rubric · Decision Trees (medical, vital documents, disability, camping ticket, property taken) · Resource Lists (sort preferred/alpha/verified, print) · Pop-Up Events (temporary, auto-expire) · Gaps & Follow-ups (title, ideas, owner, status) · Import/Export JSON.
- Dimension colors: Physical `#07508b`, Social `#5086a6`, Financial `#00abc3`, Environmental `#56a33f`, Intellectual `#f6b916`, Occupational `#fa791c`, Emotional `#db138a`, Spiritual `#6e328e`.

## BFF brand tokens (from the live site)
| Token | Value |
|---|---|
| Background | `#e9e6d2` (warm paper) |
| Surface | `#f3f1e2` |
| Text / heading | `#15261a` |
| Muted text | `#3f4f3b` |
| Brand green | `#a7c25a` (accessible accent `#748c1d`) |
| Link | `#1b6d46` |
| Button | pill, gradient `#a7c25a → #f2cb4a` |
| Dark bg / surface | `#0f1a13` / `#16241b`, dark text `#eaebd6` |
| Heading font | Newsreader (serif, weight ~380) |
| Body font | Atkinson Hyperlegible (chosen for low-vision legibility — keep it) |
| Radius | 14px |

Google Fonts: `https://fonts.googleapis.com/css2?family=Newsreader:wght@380;400;450;500;520&family=Atkinson+Hyperlegible:wght@400;600;700&display=swap`
