/**
 * Website enrichment: read each service's own web page, extract facts with
 * evidence, verify them, and queue suggestions for review (nothing auto-publishes).
 *
 *   npx tsx scripts/enrich.ts [--limit N] [--service ID] [--dry-run] [--no-llm] [--json]
 *
 * LLM extraction runs only when ANTHROPIC_API_KEY is set (and not --no-llm).
 */
import { runEnrichment } from "../lib/enrich/runner";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  if (i !== -1) return process.argv[i + 1];
  const eq = process.argv.find((a) => a.startsWith(`${name}=`));
  return eq?.slice(name.length + 1);
}
const has = (name: string) => process.argv.includes(name);

async function main() {
  const limit = arg("--limit") ? Number(arg("--limit")) : undefined;
  if (limit !== undefined && (!Number.isFinite(limit) || limit < 1)) throw new Error("--limit must be a positive number");
  const res = await runEnrichment({
    limit,
    serviceId: arg("--service"),
    dryRun: has("--dry-run"),
    llm: has("--no-llm") ? false : undefined,
    log: has("--json") ? () => {} : console.log,
  });
  if (has("--json")) console.log(JSON.stringify(res, null, 2));
  process.exit(res.error ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
