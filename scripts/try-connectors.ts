/**
 * Run every ingest connector live and print counts plus one sample record.
 *   npx tsx scripts/try-connectors.ts [connector-id ...]
 */
import { connectors } from "../lib/ingest/connectors";

async function main() {
  const only = process.argv.slice(2);
  let failed = 0;
  for (const c of connectors) {
    if (only.length && !only.includes(c.id)) continue;
    const t0 = Date.now();
    try {
      const { records, notices = [] } = await c.fetch();
      const ms = Date.now() - t0;
      console.log(`\n== ${c.id} (${ms} ms): ${records.length} records, ${notices.length} notices`);
      if (records[0]) console.log(JSON.stringify(records[0], null, 2));
      if (notices[0]) console.log(JSON.stringify(notices[0], null, 2));
    } catch (err) {
      failed++;
      console.log(`\n== ${c.id}: FAILED — ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  process.exitCode = failed ? 1 : 0;
}

main();
