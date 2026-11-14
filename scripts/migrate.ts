import { getDb, dbKind } from "../lib/db";

async function main() {
  const db = getDb();
  const migrationsFolder = "./drizzle";
  if (dbKind() === "neon") {
    const { migrate } = await import("drizzle-orm/neon-serverless/migrator");
    await migrate(db as never, { migrationsFolder });
  } else {
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    await migrate(db as never, { migrationsFolder });
  }
  console.log(`Migrated (${dbKind()}).`);
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
