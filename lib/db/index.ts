import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;

type Holder = { db?: DB; kind?: "neon" | "pglite" };
const g = globalThis as unknown as { __bffDb?: Holder };
const holder: Holder = (g.__bffDb ??= {});

/**
 * Neon (serverless Pool) when DATABASE_URL is set; otherwise an embedded
 * PGlite database in .data/pglite for local development.
 */
function create(): DB {
  const url = process.env.DATABASE_URL;
  if (url && url.startsWith("postgres")) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Pool } = require("@neondatabase/serverless") as typeof import("@neondatabase/serverless");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { drizzle } = require("drizzle-orm/neon-serverless") as typeof import("drizzle-orm/neon-serverless");
    holder.kind = "neon";
    return drizzle(new Pool({ connectionString: url }), { schema }) as unknown as DB;
  }
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
