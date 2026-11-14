# Website enrichment: richer records, with evidence

*Built by Benjamin Life ([@omniharmonic](https://github.com/omniharmonic)) for Boulder Feet Forward, November 2026.*

Most of the ~200 services in BFF Navigator have only a name, a sentence or two, and maybe a phone number. The provider's own website usually says more: hours, whether walk-ins are welcome, what it costs, whether you need ID, which languages staff speak. This system reads those pages each week and **suggests** additions. Libby approves or rejects every suggestion in **Admin → Review**. Nothing publishes on its own.

The guiding rule comes from the owner: *some accurate data is better than lots of inaccurate or out-of-date data.* The pipeline is built to stay quiet when it is unsure.

## How it works

```
service.url ──► fetch ──► extract ──► verify (the gate) ──► propose ──► Admin → Review ──► Libby approves
                (polite)   │ deterministic (no AI)   drops anything        one suggestion
                           │ + optional LLM          it can't prove         per service
```

| Step | File | What it does |
|---|---|---|
| Fetch | `lib/enrich/fetch.ts` | Respects robots.txt, waits 1 second between requests to the same site, 15 s timeout, 2 MB cap, up to 3 redirects. Identifies itself as `BFF-Navigator-Enricher/1.0 (+https://github.com/omniharmonic/bffresourcelibrary)`. Strips nav, footer and scripts, then keeps the page text, its JSON-LD, its `tel:`/`mailto:` links and a fingerprint (hash) of the text. |
| Extract (no AI) | `lib/enrich/extract-deterministic.ts` | schema.org JSON-LD (hours, phone, address, map pin, email), phone and Boulder-area address patterns, hours sentences (via `parseHours`) and a short list of high-precision phrases ("walk-ins welcome", "no ID required", "se habla español", "sliding scale", "wheelchair accessible", "ages 18–24"). If a page lists two different phone numbers, schedules or addresses, it extracts **nothing** for that field and says why. |
| Extract (AI, optional) | `lib/enrich/extract-llm.ts` | Only when `ANTHROPIC_API_KEY` is set. A small, fast Claude model reads the page and must return each fact with a **word-for-word quote** from it. It is told to leave out anything implied and never to infer. |
| Verify | `lib/enrich/verify.ts` | The anti-hallucination gate (below). |
| Propose | `lib/enrich/propose.ts` | Compares what survived with the record and applies "human wins" (below). Writes at most one suggestion per service per run. |
| Run | `lib/enrich/runner.ts`, `scripts/enrich.ts` | Picks which services to check, logs each run to `ingest_runs` (source `enrich:web`), and opens page-change notices. |
| Field-check list | `lib/enrich/verify-queue.ts` | Ranks the services that most need a person to go and look (see below). |

### New data: `services.details`

Structured "before you go" facts live in a `details` JSON column. `lib/details.ts` lists them (`DETAIL_FIELDS`) with labels and help text:

| Key | Kind | Example |
|---|---|---|
| `walkIn` | yes/no | Walk-ins welcome |
| `appointmentRequired` | yes/no | By appointment only |
| `cost` | text | Free · Sliding scale · Medicaid accepted |
| `idRequired` | yes/no | No ID required |
| `documentsToBring` | list | Photo ID, proof of income |
| `languages` | list | Spanish |
| `ageRange` | text | 18+ · Ages 12–24 |
| `genderServed` | text | Women and children |
| `accessibility` | text | Wheelchair accessible |
| `whatToExpect` | text | What happens when you arrive |
| `intakeProcess` | text | Forms, screening, waitlist |
| `capacityNotes` | text | Beds fill by 5pm |
| `transit` | text | Two blocks from the downtown bus station (SKIP, HOP) |
| `lastHoursChange` | text | Announced change to hours, with its date |

`applyServiceChange` accepts `payload.details` and merges it (a `null` value clears a key). Provenance is recorded per key in `field_sources` under `details.<key>`, exactly like ordinary fields. Two bookkeeping columns, `source_page_hash` and `source_checked_at`, remember what the page looked like at the last check.

## Accuracy rules

### The verify gate

A candidate value is dropped unless **all** of these hold:

1. **The quote is really on the page.** Its quote must appear in the fetched page text, after normalizing whitespace, curly quotes and dashes. JSON-LD values must appear in the page's JSON-LD; text patterns can't borrow from it. AI quotes shorter than 8 characters don't count. This is the check that catches an AI "remembering" something the page doesn't say.
2. **The quote supports the value by itself.**
   - Phone: the 10 digits are in the quote.
   - Hours: the quote parses to exactly the same weekly schedule as the value.
   - Address: the street number and street name are in the quote, and the address is in Colorado.
   - Yes/no: a known phrase in the quote agrees (a quote saying "No ID required" can't support "ID required: yes"). For AI answers the quote must at least be about the topic.
   - Lists: each item must be in the quote; unsupported items are pruned.
   - Text: every number, and at least 70% of the content words, must be in the quote.
3. **Hours are client hours, weekly and for one place.** Dropped when the quote is about donations, volunteers or staff; covers several locations; is irregular ("first Tuesday", "most Saturdays", "except"); is a dated event ("starting October 14"); is for one group or class that isn't the service itself; or says "24/7" about care or supervision rather than opening.
4. **The page is about this service.** If the page never mentions the service's (or its organization's) name, everything from it is dropped. This stops a county home page from overwriting a specific program.
5. **Confidence is high enough** (≥ 0.5):

| Signal | Effect |
|---|---|
| Method | JSON-LD 0.90 · text pattern 0.75 · AI 0.55 |
| Another method on the same page agrees | +0.10 |
| Already matches the record | +0.10 (nothing new is proposed, but it counts as corroboration) |
| The page dates itself more than 18 months ago ("Last updated", `dateModified`, meta tags; © year as a last resort) | −0.25 |

On a stale page, an AI-only fact (0.30) is dropped. A pattern fact (0.50) is still shown, and the summary says the page may be out of date.

### "Human wins" (as in ARCHITECTURE §3.2)

- **Locked fields are never touched.** Lock `details` to protect every detail key.
- **A value a person set** (`volunteer:`, `admin:` or `seed:` provenance) is left alone unless the website disagrees **and** confidence is high (≥ 0.85, in practice JSON-LD or two methods agreeing). Then the suggestion is flagged *Conflicts with field notes* so Libby looks twice.
- Only empty or different values are proposed. Long free-text fields (`eligibility`, `access`, `whatToExpect`, `intakeProcess`) are only filled when empty, so a person's wording isn't reworded.
- A map pin alone never opens a review item.

### Not repeating ourselves

- **One open suggestion per service.** A newer suggestion replaces older pending ones (they are marked rejected with the note "Superseded by a newer website check").
- **Identical suggestions aren't re-queued.** Comparison uses key-sorted JSON, because Postgres `jsonb` reorders keys.
- **A suggestion Libby rejected isn't re-proposed for 180 days** unless the website says something different.
- **Page-change notice:** if the page's text changed since the last check but nothing extractable changed, a `notice` ("Provider page changed — worth a quick check") is queued, at most once per 30 days per service.

## How Libby reviews a suggestion

Each suggestion is a `change_requests` row with `kind: "update"` and `source: "enrich:web"`. Its `summary` is a plain sentence, for example:

> Website lists hours Mon, Wed, Fri 10am–2pm, phone 303-555-0142, walk-ins welcome and no ID required.

Its `payload`:

```jsonc
{
  "fields":  { "hoursText": "Mon, Wed, Fri 10am–2pm", "phone": "303-555-0142" },
  "details": { "walkIn": true, "idRequired": false },
  "evidence": {
    "hoursText": {
      "url": "https://pantry.example.org/",
      "quote": "Open Monday, Wednesday & Friday, 10am–2pm.",   // verbatim from the page, ≤200 chars
      "method": "pattern",                                     // "jsonld" | "pattern" | "llm"
      "confidence": 0.85,
      "previous": null,                                        // what the record says now
      "conflictsWithFieldNotes": true                          // only when overriding a person's value
    },
    "details.walkIn": { "url": "…", "quote": "Walk-ins welcome — no appointment necessary.", "method": "pattern", "confidence": 0.75, "previous": null }
  },
  "conflicts": ["hoursText"],
  "page": { "url": "…", "hash": "…", "checkedAt": "2026-11-15T10:43:00Z", "datedAt": "2026-09-02T21:04:00Z", "stale": false }
}
```

For each line she sees the current value, the suggested value, **the quote and a link to the page**, how it was found and how confident the system is. Approving applies `fields` and `details` through `applyServiceChange`, and the provenance becomes hers (`admin:<id>`). If only some lines are right, she can edit and approve, or reject with a note. Rejecting teaches the system not to repeat itself for 180 days. JSON-LD quotes are snippets of the page's structured data, so they look like code; that's expected.

### What the review screen needs to render

- `payload.details`: one row per key, labelled from `DETAIL_FIELDS` (`formatDetail()` turns values into text). The current value comes from `services.details`.
- `payload.evidence[key]`: the quote (as a blockquote), a link to `url`, the `method` and `confidence`, and a warning when `conflictsWithFieldNotes` is true. Keys are `"phone"`, `"hoursText"` and so on, or `"details.<key>"`.
- `payload.page.stale`: a "page may be out of date" badge.
- Notices from `enrich:web` carry `payload.url` (the provider page), not a document.

## The field-check list

Websites can't tell you whether the door is actually open. `servicesNeedingFieldCheck()` in `lib/enrich/verify-queue.ts` ranks the services that most need a person to visit or call:

```
score = usage × staleness × gaps
usage     = 1 + log2(1 + times added to plans) (+1 if BFF-preferred)
staleness = months since verified_at ÷ 6, capped at 3 (never verified = 3)
gaps      = 1 + share missing of: hours, phone, address, walk-ins, cost, ID
```

Each item comes with a plain reason, such as "On 12 plans · never checked in person · missing hours, cost". It's ready for a "Go check these" panel in the UI.

## Running it

```bash
npx tsx scripts/enrich.ts --dry-run --limit 10      # see what it would propose; writes nothing
npx tsx scripts/enrich.ts --service r038 --dry-run   # one service
npx tsx scripts/enrich.ts --limit 60                 # real run (queues suggestions)
npx tsx scripts/enrich.ts --no-llm                   # deterministic only, even with a key
npx tsx scripts/enrich.ts --json                     # machine-readable outcomes, incl. every dropped candidate and why
```

(`npm run enrich -- --dry-run` works too.) It uses `DATABASE_URL` like every other script.

**Which services, in what order:** active, temporary and unverified services that have a website. Social media, Google Docs, link shorteners and PDFs are skipped. Preferred and frequently planned services go first, then the least recently checked. Anything checked in the last 25 days goes to the back of the line.

**Schedule:** `.github/workflows/enrich.yml` runs every Sunday at 03:43 Boulder time (10:43 UTC, which is 04:43 during daylight time). It checks 60 services, so the whole list rotates about once a month. Manual runs take `limit`, `service` and `dry_run` inputs. Secrets: `DATABASE_URL` (required) and `ANTHROPIC_API_KEY` (optional; see `docs/RUNBOOK-SECRETS.md` §7a).

**Tests:** `tests/enrich.test.ts` covers the fetcher (robots, rate limit, redirects, size cap), extraction against the recorded pages in `tests/fixtures/enrich/` (JSON-LD, hours in prose, a misleading multi-program page and a stale page), the verify gate (including fabricated quotes), proposals and an end-to-end run on in-memory Postgres. A section of the tests replays traps found on real Boulder provider pages.

## Costs

- **Without an AI key:** free. It makes about 2 requests per site per week.
- **With `ANTHROPIC_API_KEY`:** one request per page to a small, fast Claude model (`LLM_MODEL` in `lib/enrich/extract-llm.ts`), sending at most 60,000 characters of page text at low effort. At current pricing ($0.10 per million input tokens and $0.50 per million output tokens, for prompts under 100K tokens), a typical page costs a fraction of a cent. Expect **about $1–3 a month** for ~200 services checked monthly. Put the key in a workspace with a spend limit.

## Limitations

- **Pages that need JavaScript to render** (some Wix/React sites) look nearly empty to the fetcher. Nothing is proposed from them.
- **PDF street sheets and Facebook pages are skipped.** The All Roads guide is watched separately (`allroads-guide` connector).
- **Multi-program pages** (a church with a pantry, a shelter and an office) often give nothing, by design: the system won't guess which hours belong to which program.
- **Phone-line hours** ("Call us Mon–Fri 9–6") are proposed as the service's hours. For phone-first services that's right; otherwise Libby should reject.
- **Irregular schedules** (monthly, seasonal, "most Saturdays") are never proposed. They need a person.
- **Website ≠ reality.** A page can be current and still wrong. The field-check list exists for that, and volunteer field notes always win.
- The phrase patterns are English-first, plus "se habla español". The AI step covers other wording, but only with a word-for-word quote.
