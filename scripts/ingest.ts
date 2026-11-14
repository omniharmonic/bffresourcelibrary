import { connectors } from "../lib/ingest/connectors";
import { runConnector } from "../lib/ingest/runner";

async function main() {
  const only = process.argv[2];
  let failed = 0;
  for (const c of connectors) {
    if (only && c.id !== only) continue;
    const s = await runConnector(c, { log: console.log });
    if ("error" in s) failed++;
  }
  process.exit(failed ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
