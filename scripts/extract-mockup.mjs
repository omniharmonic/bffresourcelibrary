// One-time extraction of Libby's mockup data into seed JSON. Evaluates only the
// data literals (BFF_DATA and treesData) inside an empty VM context.
import fs from 'node:fs';
import vm from 'node:vm';
const html = fs.readFileSync(process.argv[2], 'utf8');
const data = JSON.parse(html.match(/window\.BFF_DATA\s*=\s*(\{.*?\});?\s*<\/script>/s)[1]);
function literalAfter(marker, from = 0) {
  const i = html.indexOf(marker, from);
  if (i < 0) return null;
  let j = html.indexOf('{', i), depth = 0, inStr = null;
  for (let k = j; k < html.length; k++) {
    const c = html[k];
    if (inStr) { if (c === '\\') { k++; continue; } if (c === inStr) inStr = null; continue; }
    if (c === "'" || c === '"' || c === '`') { inStr = c; continue; }
    if (c === '{') depth++;
    if (c === '}' && --depth === 0) return html.slice(j, k + 1);
  }
}
const ctx = vm.createContext({});
const trees = vm.runInContext('(' + literalAfter('const treesData=') + ')', ctx);
for (const m of html.matchAll(/treesData\.([a-z]+)=/g)) trees[m[1]] = vm.runInContext('(' + literalAfter(m[0], m.index) + ')', ctx);
fs.writeFileSync('data/seed/bff-v3.json', JSON.stringify(data, null, 2));
fs.writeFileSync('data/seed/decision-trees.json', JSON.stringify(trees, null, 2));
console.log('resources', data.resources.length, 'trees', Object.keys(trees));
