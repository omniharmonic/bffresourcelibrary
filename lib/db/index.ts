import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;

type Holder = { db?: DB; kind?: "neon" | "pg" | "pglite" };
const g = globalThis as unknown as { __bffDb?: Holder };
const holder: Holder = (g.__bffDb ??= {});

/**
 * Neon (serverless Pool) when DATABASE_URL is set; node-postgres for a local
 * Postgres URL (localhost) or DB_DRIVER=pg; otherwise an embedded PGlite database
 * in .data/pglite (single process only — stop `next dev` before running scripts).
 */
function create(): DB {
  const url = process.env.DATABASE_URL;
  if (url && url.startsWith("postgres") && (process.env.DB_DRIVER === "pg" || /@(localhost|127\.0\.0\.1|postgres|db)[:/]/.test(url))) {
    // Plain Postgres (local Docker/Homebrew, CI) via node-postgres.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Pool } = require("pg") as typeof import("pg");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { drizzle } = require("drizzle-orm/node-postgres") as typeof import("drizzle-orm/node-postgres");
    holder.kind = "pg";
    return drizzle(new Pool({ connectionString: url, max: 5 }), { schema }) as unknown as DB;
  }
  if (url && url.startsWith("postgres")) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Pool } = require("@neondatabase/serverless") as typeof import("@neondatabase/serverless");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { drizzle } = require("drizzle-orm/neon-serverless") as typeof import("drizzle-orm/neon-serverless");
    holder.kind = "neon";
    return drizzle(new Pool({ connectionString: url }), { schema }) as unknown as DB;
  }
  if (process.env.VERCEL) throw new Error("DATABASE_URL is not set. Add the Neon connection string in Vercel → Settings → Environment Variables.");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PGlite } = require("@electric-sql/pglite") as typeof import("@electric-sql/pglite");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { drizzle } = require("drizzle-orm/pglite") as typeof import("drizzle-orm/pglite");
  holder.kind = "pglite";
  const dir = process.env.PGLITE_DIR ?? ".data/pglite";
  if (dir !== ":memory:") require("node:fs").mkdirSync(require("node:path").dirname(dir), { recursive: true });
  return drizzle(new PGlite(dir === ":memory:" ? undefined : dir), { schema }) as unknown as DB;
}

export function getDb(): DB {
  return (holder.db ??= create());
}

export function dbKind() {
  getDb();
  return holder.kind!;
}

export { schema };
