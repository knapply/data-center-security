// Validates data/*.yaml and builds the static site into _site/.
// Usage: node scripts/build.mjs [--check]   (--check validates only)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const load = (f) => yaml.load(fs.readFileSync(path.join(root, 'data', f), 'utf8'));

const vocab = load('vocabulary.yaml');
const incidents = load('incidents.yaml') ?? [];
const supply = load('supply-chain.yaml');
const headlines = load('headlines.yaml') ?? [];

const errors = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);
const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d instanceof Date ? d.toISOString().slice(0, 10) : String(d));
const iso = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d));

const ids = new Set();
for (const [i, inc] of incidents.entries()) {
  const at = `incidents[${i}] ${inc.id ?? '(no id)'}`;
  for (const k of ['id', 'date', 'title', 'type', 'category', 'status', 'severity', 'affects', 'impacts', 'summary', 'sources'])
    if (inc[k] === undefined || inc[k] === null || inc[k] === '') err(at, `missing ${k}`);
  if (inc.id && !/^\d{4}-[a-z0-9-]+$/.test(inc.id)) err(at, 'id must look like YYYY-short-slug');
  if (ids.has(inc.id)) err(at, 'duplicate id');
  ids.add(inc.id);
  if (inc.date && !isDate(inc.date)) err(at, 'date must be YYYY-MM-DD');
  if (inc.date_precision && !['day', 'month', 'year'].includes(inc.date_precision)) err(at, 'bad date_precision');
  for (const k of ['type', 'status', 'severity'])
    if (inc[k] && !vocab[k].includes(inc[k])) err(at, `${k} "${inc[k]}" not in vocabulary`);
  for (const k of ['category', 'affects', 'impacts']) {
    if (inc[k] && !Array.isArray(inc[k])) { err(at, `${k} must be a list`); continue; }
    for (const v of inc[k] ?? []) if (!vocab[k].includes(v)) err(at, `${k} "${v}" not in vocabulary`);
  }
  if (inc.location) {
    const { lat, lon } = inc.location;
    if (typeof lat !== 'number' || lat < -90 || lat > 90) err(at, 'bad location.lat');
    if (typeof lon !== 'number' || lon < -180 || lon > 180) err(at, 'bad location.lon');
    // City/metro precision only: never pinpoint a facility.
    for (const v of [lat, lon]) if (typeof v === 'number' && (String(v).split('.')[1] ?? '').length > 2)
      err(at, 'coordinates must have at most 2 decimals (city-level)');
  }
  if (Array.isArray(inc.sources)) {
    if (!inc.sources.length) err(at, 'needs at least one source');
    for (const s of inc.sources) {
      if (!s?.publisher) err(at, 'each source needs a publisher');
      if (s?.url && !/^https:\/\//.test(s.url)) err(at, `source url must be https: ${s.url}`);
    }
    if (!inc.seed && !inc.sources.some((s) => s?.url)) err(at, 'non-seed entries need at least one source url');
  }
}

const levels = ['normal', 'elevated', 'high'];
for (const [i, c] of (supply?.components ?? []).entries()) {
  const at = `supply-chain[${i}] ${c.id}`;
  if (!levels.includes(c.level)) err(at, `level must be one of ${levels.join(', ')}`);
  if (!['up', 'flat', 'down'].includes(c.trend)) err(at, 'trend must be up, flat or down');
  for (const r of c.related_incidents ?? []) if (!ids.has(r)) err(at, `unknown incident ${r}`);
}
for (const [i, h] of headlines.entries()) {
  const at = `headlines[${i}]`;
  if (!h.title || !h.url || !isDate(h.date)) err(at, 'needs date, title and url');
  if (h.category && !vocab.category.includes(h.category)) err(at, `category "${h.category}" not in vocabulary`);
}

if (errors.length) {
  console.error(`Validation failed (${errors.length}):\n- ` + errors.join('\n- '));
  process.exit(1);
}
console.log(`Valid: ${incidents.length} incidents, ${supply?.components?.length ?? 0} components, ${headlines.length} headlines`);
if (process.argv.includes('--check')) process.exit(0);

const out = path.join(root, '_site');
fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(path.join(root, 'site'), out, { recursive: true });
fs.mkdirSync(path.join(out, 'data'), { recursive: true });
const sorted = incidents.map((x) => ({ ...x, date: iso(x.date) })).sort((a, b) => b.date.localeCompare(a.date));
const write = (f, v) => fs.writeFileSync(path.join(out, 'data', f), JSON.stringify(v));
write('incidents.json', sorted);
write('supply-chain.json', { ...supply, as_of: iso(supply.as_of) });
write('headlines.json', headlines.map((h) => ({ ...h, date: iso(h.date) })));
write('vocabulary.json', vocab);
console.log('Built _site/');
