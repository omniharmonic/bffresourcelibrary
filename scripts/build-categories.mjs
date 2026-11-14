import fs from 'node:fs';
const slugify = s => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g,'').replace(/&/g,' and ').replace(/\(.*?\)/g,m=>' '+m.slice(1,-1)+' ').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
const d = JSON.parse(fs.readFileSync('data/seed/bff-v3.json','utf8'));
const cats = new Map();
for (const [dim, tiers] of Object.entries(d.dimensions)) tiers.forEach((list, t) => list.forEach(name => {
  const slug = slugify(name);
  if (!cats.has(slug)) cats.set(slug, { slug, name, dimension: slugify(dim), tier: t + 1, alsoIn: [], description: '', icon: '' });
  else cats.get(slug).alsoIn.push({ dimension: slugify(dim), tier: t + 1 });
}));
for (const r of d.resources) for (const c of r.categories) if (!cats.has(slugify(c))) cats.set(slugify(c), { slug: slugify(c), name: c, dimension: 'environmental', tier: 1, alsoIn: [], description: '', icon: '' });
const prev = fs.existsSync('data/seed/categories.json') ? JSON.parse(fs.readFileSync('data/seed/categories.json','utf8')) : [];
for (const p of prev) if (cats.has(p.slug)) Object.assign(cats.get(p.slug), { description: p.description, icon: p.icon });
fs.writeFileSync('data/seed/categories.json', JSON.stringify([...cats.values()], null, 2));
console.log(cats.size, [...cats.values()].map(c=>`${c.slug}:${c.dimension}:${c.tier}`).join(' '));
