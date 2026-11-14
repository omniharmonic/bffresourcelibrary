import { eq } from "drizzle-orm";
import { getDb, schema } from "./db";

export type Settings = { participant_mode: boolean; ai_assist: boolean };
export const DEFAULT_SETTINGS: Settings = { participant_mode: false, ai_assist: false };

export async function getSettings(): Promise<Settings> {
  const rows = await getDb().select().from(schema.settings);
  const out = { ...DEFAULT_SETTINGS } as Record<string, unknown>;
  for (const r of rows) out[r.key] = r.value;
  return out as Settings;
}

export async function setSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  const db = getDb();
  const existing = await db.select().from(schema.settings).where(eq(schema.settings.key, key));
  if (existing.length) await db.update(schema.settings).set({ value }).where(eq(schema.settings.key, key));
  else await db.insert(schema.settings).values({ key, value });
}

export const aiAvailable = () => !!process.env.TYPESAFE_API_KEY;
