import { and, eq, sql } from "drizzle-orm";
import { getDb, schema } from "../db";
import { createChangeRequest } from "../services";
import { stableJson } from "../ingest/runner";
import { createFetcher, type FetchResult, type FetchedPage } from "./fetch";
import { extractDeterministic } from "./extract-deterministic";
import { extractWithLlm, llmEnabled, type LlmClient } from "./extract-llm";
import { verifyCandidates, type VerifyResult } from "./verify";
import { buildProposal, currentValues, proposalKey, type Proposal } from "./propose";
import type { Candidate, DroppedCandidate } from "./types";

export const ENRICH_SOURCE = "enrich:web";
const NOTICE_EVERY_DAYS = 30;
const RECHECK_AFTER_DAYS = 25;
/** Don't re-propose something Libby already rejected within this window. */
const REJECTION_MEMORY_DAYS = 180;

type Svc = typeof schema.services.$inferSelect;
type CR = typeof schema.changeRequests.$inferSelect;

export type ServiceOutcome = {
  serviceId: string;
  name: string;
  url: string;
  status: "proposed" | "duplicate" | "previously-rejected" | "nothing-new" | "notice" | "fetch-failed" | "skipped";
  detail?: string;
  candidates: number;
  verified: number;
  dropped: DroppedCandidate[];
  proposal?: Proposal | null;
  pageChanged?: boolean;
  page?: VerifyResult["page"];
};

export type EnrichDeps = {
  fetchPage: (url: string) => Promise<FetchResult>;
  llm?: LlmClient | false;
  log?: (s: string) => void;
  now?: Date;
};

/** Hosts whose pages are not the provider's own words, or that we can't read. */
const SKIP_HOST = /(^|\.)(facebook|instagram|twitter|x|linkedin|youtube|tiktok|linktr|docs\.google|drive\.google|bit|tinyurl)\.(com|ee|ly|google\.com)$|^docs\.google\.com$|^drive\.google\.com$/i;

export function skipReason(url: string): string | null {
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    if (SKIP_HOST.test(u.hostname)) return `social/doc host (${u.hostname})`;
    if (/\.(pdf|docx?|xlsx?|pptx?|jpe?g|png)$/i.test(u.pathname)) return "not a web page";
    return null;
  } catch {
    return "bad url";
  }
}

/** Fetch → extract → verify → compare. No database writes. */
export async function analyzeService(svc: Svc, deps: EnrichDeps): Promise<ServiceOutcome & { pageResult?: FetchedPage }> {
  const url = svc.url ?? "";
  const base = { serviceId: svc.id, name: svc.name, url, candidates: 0, verified: 0, dropped: [] as DroppedCandidate[] };
  const skip = skipReason(url);
  if (skip) return { ...base, status: "skipped", detail: skip };
  const res = await deps.fetchPage(url);
  if (!res.ok) return { ...base, status: "fetch-failed", detail: `${res.reason}${res.detail ? `: ${res.detail}` : ""}` };
  const det = extractDeterministic(res);
  let candidates: Candidate[] = det.candidates;
  if (deps.llm !== false && (deps.llm || llmEnabled())) {
    const llm = await extractWithLlm(res, svc, { client: deps.llm || undefined, log: deps.log });
    candidates = [...candidates, ...llm.candidates];
  }
  const fields = [...new Set(candidates.map((c) => c.field))];
  const verified = verifyCandidates(res, candidates, { service: svc, current: currentValues(svc, fields), now: deps.now });
  const proposal = buildProposal(svc, verified, deps.now);
  return {
    ...base,
    status: proposal ? "proposed" : "nothing-new",
    candidates: candidates.length,
    verified: verified.verified.length,
    dropped: [...det.ambiguous.map((a) => ({ ...a })), ...verified.dropped],
    proposal,
    page: verified.page,
    pageChanged: !!svc.sourcePageHash && svc.sourcePageHash !== res.hash,
    pageResult: res,
  };
}

const daysAgo = (d: Date, n: number) => new Date(+d - n * 86_400_000);

/** Pick services to check: has a url, not inactive; preferred and often-planned first; not checked recently. */
export async function selectServices(opts: { limit?: number; serviceId?: string; now?: Date } = {}) {
  const db = getDb();
  const now = opts.now ?? new Date();
  const rows = opts.serviceId
    ? await db.select().from(schema.services).where(eq(schema.services.id, opts.serviceId))
    : await db.select().from(schema.services).where(sql`${schema.services.status} <> 'inactive' and coalesce(${schema.services.url}, '') <> ''`);
  const counts = await db
    .select({ serviceId: schema.planItems.serviceId, n: sql<number>`count(*)::int` })
    .from(schema.planItems)
    .groupBy(schema.planItems.serviceId);
  const uses = new Map(counts.map((c) => [c.serviceId, Number(c.n)]));
  const recent = daysAgo(now, RECHECK_AFTER_DAYS);
  const sorted = rows
    .filter((s) => opts.serviceId || (s.url && s.status !== "inactive"))
    .map((s) => ({ s, uses: uses.get(s.id) ?? 0 }))
    .sort((a, b) => {
      const ra = a.s.sourceCheckedAt && a.s.sourceCheckedAt > recent ? 1 : 0;
      const rb = b.s.sourceCheckedAt && b.s.sourceCheckedAt > recent ? 1 : 0;
      if (ra !== rb) return ra - rb;
      const pa = (a.s.preferred ? 5 : 0) + Math.log2(1 + a.uses), pb = (b.s.preferred ? 5 : 0) + Math.log2(1 + b.uses);
      if (pa !== pb) return pb - pa;
      return (+(a.s.sourceCheckedAt ?? 0)) - (+(b.s.sourceCheckedAt ?? 0));
    })
    .map((x) => x.s);
  return opts.limit ? sorted.slice(0, opts.limit) : sorted;
}

async function enrichRequests(serviceId: string): Promise<CR[]> {
  return getDb()
    .select()
    .from(schema.changeRequests)
    .where(and(eq(schema.changeRequests.source, ENRICH_SOURCE), eq(schema.changeRequests.serviceId, serviceId)));
}

/** Write the outcome for one service: change request, page-change notice, bookkeeping. */
export async function recordOutcome(svc: Svc, out: ServiceOutcome & { pageResult?: FetchedPage }, now = new Date()): Promise<ServiceOutcome> {
  const db = getDb();
  if (out.status === "skipped" || out.status === "fetch-failed") {
    await db.update(schema.services).set({ sourceCheckedAt: now }).where(eq(schema.services.id, svc.id));
    return out;
  }
  const existing = await enrichRequests(svc.id);
  if (out.proposal) {
    const key = stableJson(proposalKey(out.proposal.payload));
    const pending = existing.filter((r) => r.status === "pending" && r.kind === "update");
    const rejectedRecently = existing.some((r) => r.status === "rejected" && r.reviewerId && r.reviewedAt && r.reviewedAt > daysAgo(now, REJECTION_MEMORY_DAYS) && stableJson(proposalKey(r.payload as never)) === key);
    if (pending.some((r) => stableJson(proposalKey(r.payload as never)) === key)) out = { ...out, status: "duplicate" };
    else if (rejectedRecently) out = { ...out, status: "previously-rejected" };
    else {
      const row = await createChangeRequest({ kind: "update", serviceId: svc.id, payload: out.proposal.payload, summary: out.proposal.summary, source: ENRICH_SOURCE, proposedBy: null });
      // One open website suggestion per service: older pending ones are superseded by fresher evidence.
      for (const r of pending)
        await db
          .update(schema.changeRequests)
          .set({ status: "rejected", reviewNote: `Superseded by a newer website check (#${row.id})`, reviewedAt: now })
          .where(and(eq(schema.changeRequests.id, r.id), eq(schema.changeRequests.status, "pending")));
    }
  } else if (out.pageChanged) {
    const recentNotice = existing.some((r) => r.kind === "notice" && r.createdAt > daysAgo(now, NOTICE_EVERY_DAYS));
    if (!recentNotice) {
      await createChangeRequest({
        kind: "notice",
        serviceId: svc.id,
        payload: { key: `enrich:page-changed:${svc.id}:${out.page?.hash.slice(0, 12)}`, url: out.page?.url ?? svc.url, previousHash: svc.sourcePageHash, hash: out.page?.hash },
        summary: `Provider page changed — worth a quick check: ${out.page?.url ?? svc.url}`,
        source: ENRICH_SOURCE,
      });
      out = { ...out, status: "notice" };
    }
  }
  await db
    .update(schema.services)
    .set({ sourceCheckedAt: now, ...(out.page ? { sourcePageHash: out.page.hash } : {}) })
    .where(eq(schema.services.id, svc.id));
  return out;
}

export type RunStats = {
  checked: number;
  fetched: number;
  fetchFailed: number;
  skipped: number;
  candidates: number;
  verified: number;
  dropped: number;
  proposed: number;
  duplicates: number;
  notices: number;
  unchanged: number;
};

export async function runEnrichment(opts: {
  limit?: number;
  serviceId?: string;
  dryRun?: boolean;
  fetchImpl?: typeof fetch;
  /** Injected for tests (the per-host 1 req/sec wait). */
  sleep?: (ms: number) => Promise<void>;
  llm?: LlmClient | false;
  log?: (s: string) => void;
  now?: Date;
} = {}) {
  const db = getDb();
  const log = opts.log ?? (() => {});
  const now = opts.now ?? new Date();
  const stats: RunStats = { checked: 0, fetched: 0, fetchFailed: 0, skipped: 0, candidates: 0, verified: 0, dropped: 0, proposed: 0, duplicates: 0, notices: 0, unchanged: 0 };
  const outcomes: ServiceOutcome[] = [];
  const [run] = opts.dryRun ? [null] : await db.insert(schema.ingestRuns).values({ source: ENRICH_SOURCE }).returning();
  try {
    const services = await selectServices({ limit: opts.limit, serviceId: opts.serviceId, now });
    const fetchPage = createFetcher({ fetchImpl: opts.fetchImpl, sleep: opts.sleep });
    log(`enrich: checking ${services.length} service(s)${opts.dryRun ? " (dry run: nothing is written)" : ""}${opts.llm !== false && (opts.llm || llmEnabled()) ? " with LLM extraction" : " (deterministic only)"}`);
    for (const svc of services) {
      stats.checked++;
      let out = await analyzeService(svc, { fetchPage, llm: opts.llm, log, now });
      if (!opts.dryRun) out = await recordOutcome(svc, out, now);
      delete (out as { pageResult?: unknown }).pageResult;
      outcomes.push(out);
      if (out.status === "skipped") stats.skipped++;
      else if (out.status === "fetch-failed") stats.fetchFailed++;
      else stats.fetched++;
      stats.candidates += out.candidates;
      stats.verified += out.verified;
      stats.dropped += out.dropped.length;
      if (out.status === "proposed") stats.proposed++;
      if (out.status === "duplicate" || out.status === "previously-rejected") stats.duplicates++;
      if (out.status === "notice") stats.notices++;
      if (out.status === "nothing-new") stats.unchanged++;
      log(`- ${svc.name} [${svc.id}] ${out.status}${out.detail ? ` (${out.detail})` : ""}: ${out.candidates} candidates, ${out.verified} verified, ${out.dropped.length} dropped`);
      if (out.proposal) log(`    ${out.proposal.summary}`);
      for (const d of out.dropped) log(`    dropped ${d.field} (${d.evidence.method}): ${d.reason}`);
    }
    if (run) await db.update(schema.ingestRuns).set({ status: "ok", finishedAt: new Date(), stats }).where(eq(schema.ingestRuns.id, run.id));
    log(`enrich: ${JSON.stringify(stats)}`);
    return { stats, outcomes };
  } catch (e) {
    if (run)
      await db
        .update(schema.ingestRuns)
        .set({ status: "error", finishedAt: new Date(), stats, error: String((e as Error).message ?? e).slice(0, 1000) })
        .where(eq(schema.ingestRuns.id, run.id));
    log(`enrich: ERROR ${(e as Error).message}`);
    return { stats, outcomes, error: String((e as Error).message ?? e) };
  }
}
