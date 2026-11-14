import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/session";
import { getDb, schema } from "@/lib/db";
import { getCatalog } from "@/lib/catalog";
import { slugify } from "@/lib/slug";
import { TreeWalker } from "@/components/TreeWalker";

export default async function Tree({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await requireRole("volunteer", `/trees/${slug}`);
  const [t] = await getDb().select().from(schema.decisionTrees).where(eq(schema.decisionTrees.slug, slug));
  if (!t) notFound();
  const c = await getCatalog();
  const linkMap: Record<string, string> = {};
  for (const n of Object.values(t.nodes)) for (const l of n.links ?? []) if (c.categoryMap.has(slugify(l))) linkMap[l] = slugify(l);
  return (
    <div className="narrow">
      <p>
        <Link href="/trees">← All decision trees</Link>
      </p>
      <h1 className="page-title">{t.title}</h1>
      <TreeWalker nodes={t.nodes} linkMap={linkMap} />
    </div>
  );
}
