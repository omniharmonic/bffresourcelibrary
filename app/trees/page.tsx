import Link from "next/link";
import { asc } from "drizzle-orm";
import { requireRole } from "@/lib/session";
import { getDb, schema } from "@/lib/db";

export const metadata = { title: "Decision trees" };

export default async function Trees() {
  await requireRole("volunteer", "/trees");
  const trees = await getDb().select().from(schema.decisionTrees).orderBy(asc(schema.decisionTrees.position));
  return (
    <>
      <h1 style={{ fontSize: "clamp(28px,6vw,42px)" }}>Decision trees</h1>
      <p className="muted">Step-by-step prompts for when the next step isn’t clear. These are conversation guides, not clinical screening.</p>
      <div className="grid2">
        {trees.map((t) => (
          <Link key={t.slug} href={`/trees/${t.slug}`} className="door" style={{ padding: 18 }}>
            <h3 style={{ margin: 0 }}>{t.title}</h3>
            <span className="small muted">{t.nodes.start?.q}</span>
          </Link>
        ))}
      </div>
    </>
  );
}
