# Runbook: Configure secrets & keys for BFF Navigator

*Prepared by Benjamin Life ([@omniharmonic](https://github.com/omniharmonic)), 2026-11-14.*

**Audience:** a Claude Code agent (or a person) with a terminal. The project is fully cloud-hosted, so nothing here needs a local copy of the app. Every step is idempotent and safe to re-run.

**Goal:** set five things on the Vercel project, redeploy, and verify each one live:

| # | Variable | What it does | Required? |
|---|---|---|---|
| 1 | `BETTER_AUTH_SECRET` | Signs sign-in sessions | **Yes** |
| 2 | `ADMIN_EMAILS` | Emails that are always admins | **Yes** |
| 3 | `RESEND_API_KEY` | Sends 6-digit sign-in codes by email | **Yes** |
| 4 | `EMAIL_FROM` | The "From" on those emails | **Yes** (with #3) |
| 5 | `TYPESAFE_API_KEY` | Optional AI assist (TypeSafe Jev) | Optional |

A sixth item, the GitHub secret `DATABASE_URL`, turns on the nightly data imports (step 7).

> **Never** commit any secret value to the repo, paste it into an issue, or echo it into logs. This repository is public. Pass values to CLIs through stdin or files under `$TMPDIR`, and delete those files afterwards.

---

## 0. Facts you need

| Thing | Value |
|---|---|
| GitHub repo | `omniharmonic/bffresourcelibrary` (production branch: `claude/determined-cerf-d0xpq8`) |
| Vercel team | `omniharmonics-projects` (id `team_Jr0rIO2iOWk02yKAVI4TnUYt`) |
| Vercel project | `bffresourcelibrary` (id `prj_SsfgAN9HqWrWhJja9AX53Iw52CmG`) |
| Live URL | https://bffresourcelibrary.vercel.app |
| Neon project | `bff-navigator` (id `odd-wildflower-65536434`, database `neondb`) |
| Resend sending domain | `boulderevents.directory` (DKIM, SPF TXT, SPF MX and `rsend` CNAME all published) |
| Admins | Benjamin and Libby. **Ask Benjamin for the two addresses**; they are deliberately not written in this public repo. Both accounts already exist in the database with the admin role. |

**Tools:** the Vercel CLI (`npm i -g vercel`, then `vercel login`), plus `curl`, `openssl` and `jq`. Optionally the Resend CLI or the Resend MCP connector, and `gh` for step 7.

> The Claude.ai **Vercel connector cannot write env vars or create projects** for this team (it returns 403). Use the **Vercel CLI** with Benjamin's login, or the Vercel dashboard.

### 0.1 Point the CLI at the project (once)

Run this in any empty working directory:

```bash
vercel link --yes --scope omniharmonics-projects --project bffresourcelibrary
```

```bash
vercel env ls production --scope omniharmonics-projects
```

**Record which variables already exist.** `DATABASE_URL` should already be there. `vercel env add` fails if a variable already exists for an environment. To replace one, run `vercel env rm NAME production --yes` first, or use `vercel env update` if your CLI version has it.

### 0.2 Helper: add a secret without it touching your shell history

```bash
setenv() { # usage: setenv NAME production  (value read from stdin)
  vercel env add "$1" "$2" --sensitive --scope omniharmonics-projects 2>/dev/null \
    || vercel env add "$1" "$2" --scope omniharmonics-projects
}
```

`--sensitive` makes the value write-only in the dashboard. Older CLIs lack the flag, so the helper falls back to a plain add.

---

## 1. `BETTER_AUTH_SECRET`

Generate a fresh random secret. Never reuse one from chat logs or another project.

```bash
openssl rand -base64 48 | tr -d '\n' | setenv BETTER_AUTH_SECRET production
```

Optionally do the same for `preview`, with a different random value.

**Effect:** existing sessions are signed out once the redeploy is live. People simply sign in again with a new code. The app currently uses a private fallback secret derived from `DATABASE_URL` (see `lib/auth.ts`); this replaces it with a proper one.

## 2. `ADMIN_EMAILS`

Comma-separated, no spaces. Use the two addresses Benjamin gives you:

```bash
printf '%s' "BENJAMIN_EMAIL,LIBBY_EMAIL" | setenv ADMIN_EMAILS production
```

**Effect:** these addresses become admins on their *first* sign-in. Both accounts already exist and are already admins, so this is a safety net (for example, if an account is ever deleted and recreated). Promoting or demoting anyone else is done in the app under **Admin → Volunteers**, not here.

## 3. `RESEND_API_KEY` (sending-only, restricted to the domain)

### 3a. Confirm the domain is verified

Resend's API needs a full-access key just to read domains. Use whichever access you have.

- **Resend MCP connector:** `list-domains`, then `get-domain` for `boulderevents.directory`. Every record should show `verified`. If any shows `failed`, run `verify-domain` and wait about a minute.
- **REST** (with an existing full-access key in `$RESEND_ADMIN_KEY`):

  ```bash
  curl -s https://api.resend.com/domains -H "Authorization: Bearer $RESEND_ADMIN_KEY" | jq '.data[] | select(.name=="boulderevents.directory") | {id,status}'
  ```

- **Public DNS check** (needs no key; all four should return a value):

  ```bash
  for r in "resend._domainkey TXT" "send TXT" "send MX" "rsend CNAME"; do set -- $r; printf '%-20s ' "$1 $2"; curl -s "https://dns.google/resolve?name=$1.boulderevents.directory&type=$2" | jq -r '[.Answer[]?.data] | join(" ")' | cut -c1-70; done
  ```

Do not continue until the status is `verified`. A `partially_failed` status means emails won't send.

### 3b. Create a key that can only send from this domain

Name it `bff-navigator-production`. Use any one of these:

- **Resend MCP connector:** `create-api-key` with `name="bff-navigator-production"`, `permission="sending_access"`, `domainId=<id from 3a>`. The token is shown only once, so pipe it straight into step 3c.
- **Resend CLI** (if installed; check `resend --help` for exact flags in your version):

  ```bash
  resend api-keys create --name bff-navigator-production --permission sending_access --domain-id <DOMAIN_ID>
  ```

- **REST:**

  ```bash
  curl -s -X POST https://api.resend.com/api-keys \
    -H "Authorization: Bearer $RESEND_ADMIN_KEY" -H "Content-Type: application/json" \
    -d '{"name":"bff-navigator-production","permission":"sending_access","domain_id":"<DOMAIN_ID>"}' \
    | jq -r .token > "$TMPDIR/resend_key"
  ```

### 3c. Store it in Vercel

```bash
setenv RESEND_API_KEY production < "$TMPDIR/resend_key" && rm -f "$TMPDIR/resend_key"
```

## 4. `EMAIL_FROM`

The address must be on the verified domain. It doesn't need a real mailbox.

```bash
printf '%s' 'BFF Navigator <navigator@boulderevents.directory>' | vercel env add EMAIL_FROM production --scope omniharmonics-projects
```

> **Note:** codes come from `boulderevents.directory`, not a Boulder Feet Forward address, which may look odd to volunteers. To send from `boulderfeetforward.org` later: add that domain in Resend, publish its four DNS records at Squarespace, then repeat steps 3 and 4.

## 5. `TYPESAFE_API_KEY` (optional)

1. **A human** creates a key at https://console.typesafe.ai/keys. It needs Benjamin's account, so an agent cannot do this.
2. Smoke-test it before storing it. Expect `"noul":` near 1.0:

   ```bash
   curl -s https://api.typesafe.ai/v1/systemone -H "Authorization: Bearer $(cat "$TMPDIR/typesafe_key")" -H "Content-Type: application/json" \
     -d '{"model":"jev-latest","state":"I have not eaten since yesterday","questions":{"food":{"type":"noul","instructions":"Does the person need food?"}}}' | jq '.answers'
   ```

3. Store it:

   ```bash
   setenv TYPESAFE_API_KEY production < "$TMPDIR/typesafe_key" && rm -f "$TMPDIR/typesafe_key"
   ```

4. **Setting the key does not turn AI on.** Libby (or any admin) decides that under **Admin → Settings → AI assist**. Until she does, the app uses only the phrase lexicon. Before launch, consider asking TypeSafe for zero data retention. Text is already stripped of names, phones and addresses before it is sent.

---

## 6. Redeploy and verify

Environment variables only take effect on a **new** deployment.

```bash
vercel ls bffresourcelibrary --prod --scope omniharmonics-projects | head -5
```

Pick the newest `● Ready` production URL from that list:

```bash
vercel redeploy <that-url> --target production --scope omniharmonics-projects
```

If the CLI rejects `--target`, run `vercel redeploy <that-url>` and promote the result in the dashboard. Pushing any real code change to the production branch also triggers a deploy. **Don't push empty commits.**

### 6a. Variables present

```bash
vercel env ls production --scope omniharmonics-projects
```

Expect `DATABASE_URL`, `BETTER_AUTH_SECRET`, `ADMIN_EMAILS`, `RESEND_API_KEY`, `EMAIL_FROM`, and optionally `TYPESAFE_API_KEY`.

### 6b. Sign-in email actually arrives

```bash
curl -s -X POST https://bffresourcelibrary.vercel.app/api/auth/email-otp/send-verification-otp \
  -H 'content-type: application/json' -H 'origin: https://bffresourcelibrary.vercel.app' \
  -d '{"email":"BENJAMIN_EMAIL","type":"sign-in"}'
```

- **Expect** `{"success":true}` and, within a minute, an email titled “`NNNNNN is your BFF Navigator code`” from `navigator@boulderevents.directory`. Check spam the first time.
- **Confirm in Resend:** `list-emails` via MCP, or `curl -s https://api.resend.com/emails -H "Authorization: Bearer $RESEND_ADMIN_KEY"`, shows the send as `delivered`.
- **If it didn't send:** check the runtime logs. The Vercel MCP `get_runtime_logs` (read access works) or `vercel logs` will show `[email] send failed` with Resend's reason (wrong key, unverified domain, or a From address on another domain). A `[dev email]` line instead means `RESEND_API_KEY` didn't reach the deployment, so redeploy.

### 6c. Admin access

Sign in at https://bffresourcelibrary.vercel.app/login with an admin email. The top menu should show **Admin**.

### 6d. AI key (if set)

Admin → Settings: the **AI assist** checkbox is now clickable instead of greyed out with “Not configured.”

### 6e. Full regression suite (about 10 minutes, cleans up after itself)

Run this from a checkout of the repo with `npm ci` done. Get `DATABASE_URL` from the Neon console or `neonctl connection-string --project-id odd-wildflower-65536434`.

```bash
E2E_PROMOTE=1 BASE_URL=https://bffresourcelibrary.vercel.app DATABASE_URL="<neon url>" node tests/e2e/e2e.mjs
```

Expect `103/103 checks passed`. The suite signs in with `@example.org` test accounts. The app never emails reserved test domains (see `lib/email.ts`), so it won't create bounces on the Resend domain. It reads those codes from the database instead.

## 7. Nightly imports: GitHub secret `DATABASE_URL`

The workflow `.github/workflows/ingest.yml` runs at 02:17 Boulder time and needs the Neon connection string:

```bash
neonctl connection-string --project-id odd-wildflower-65536434 --pooled | gh secret set DATABASE_URL --repo omniharmonic/bffresourcelibrary
```

If you don't have `neonctl`, copy the pooled connection string from the Neon console and pipe it into `gh secret set` the same way.

```bash
gh workflow run "Nightly data ingest" --repo omniharmonic/bffresourcelibrary
```

```bash
gh run watch --repo omniharmonic/bffresourcelibrary
```

Expect green. In the app, **Admin → Data sources** shows a new row per source.

## 7a. Optional: GitHub secret `ANTHROPIC_API_KEY` (weekly website enrichment)

The workflow `.github/workflows/enrich.yml` runs every Sunday morning. It reads each service's own website and queues suggestions in **Admin → Review** (see `docs/ENRICHMENT.md`). It uses the same `DATABASE_URL` secret as step 7.

Without `ANTHROPIC_API_KEY` it still runs, using deterministic (no-AI) extraction only. With the key it also asks a small, fast Claude model to read each page. Every AI answer must quote the page word for word and passes the same verification gate, so the key adds coverage, not risk. Expect about $1–3 a month for ~200 services.

1. **A human** creates a key in the Anthropic Console (Settings → API keys), ideally in a workspace with a low monthly spend limit (for example $10). It needs Benjamin's account, so an agent cannot do this.
2. Store it as a repository secret. It is never needed on Vercel:

   ```bash
   gh secret set ANTHROPIC_API_KEY --repo omniharmonic/bffresourcelibrary < "$TMPDIR/anthropic_key" && rm -f "$TMPDIR/anthropic_key"
   ```

3. Try a dry run (logs what it would propose, writes nothing):

   ```bash
   gh workflow run "Weekly website enrichment" --repo omniharmonic/bffresourcelibrary -f limit=5 -f dry_run=true
   ```

   The log's first line says `with LLM extraction` when the key is picked up.

To turn the AI part off again, delete the secret: `gh secret delete ANTHROPIC_API_KEY --repo omniharmonic/bffresourcelibrary`.

## 8. Later: custom domain `navigator.boulderfeetforward.org`

1. Add the domain in Vercel (dashboard, or `vercel domains add navigator.boulderfeetforward.org bffresourcelibrary`), then add the CNAME record Vercel asks for at Squarespace DNS.
2. Keep the old address working for sign-in. Auth trusts the production domain plus that deployment's own URLs; add the `.vercel.app` host explicitly:

   ```bash
   printf '%s' 'bffresourcelibrary.vercel.app' | vercel env add EXTRA_ORIGINS production --scope omniharmonics-projects
   ```

3. Redeploy and re-run 6b and 6e against the new URL.

---

## Rollback & troubleshooting

| Symptom | Fix |
|---|---|
| Everyone signed out after deploy | Expected after step 1. Sign in again. |
| `{"success":true}` but no email | Domain not `verified` (3a), or `EMAIL_FROM` isn't on that domain. Check the `[email] send failed` log line. |
| Email lands in spam | Add DMARC at the DNS host: TXT `_dmarc` with value `v=DMARC1; p=none;`. Warm up with real traffic. |
| “Invalid origin” on sign-in | Visiting from a host auth doesn't know. Add it to `EXTRA_ORIGINS` (comma-separated) and redeploy. |
| Too many code requests | Limit is 20 per minute per network (`lib/auth.ts`). Wait a minute. |
| Need to rotate the Resend key | Create a new key (3b), replace `RESEND_API_KEY` (3c), redeploy, then delete the old key in Resend. |
| Turn AI off fast | Admin → Settings → untick AI assist. No redeploy needed. |
