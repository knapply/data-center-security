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
const componentIds = new Set((supply?.components ?? []).map((c) => c.id));
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

  // What failed, who made it, and how the supply chain contributed.
  const rc = inc.root_cause;
  // Root causes apply to things that went wrong, not to industry developments.
  if (!rc && !inc.seed && ['incident', 'vulnerability'].includes(inc.type)) err(at, 'missing root_cause (use confidence: unknown if nothing is published)');
  if (rc) {
    if (!rc.summary) err(at, 'root_cause.summary is required');
    if (!vocab.confidence.includes(rc.confidence)) err(at, `root_cause.confidence must be one of ${vocab.confidence.join(', ')}`);
    if (rc.components && !Array.isArray(rc.components)) err(at, 'root_cause.components must be a list');
    for (const [j, c] of (rc.components ?? []).entries()) {
      const cat = `${at} root_cause.components[${j}]`;
      if (!c?.part) err(cat, 'part is required');
      if (c?.role && !vocab.component_role.includes(c.role)) err(cat, `role must be one of ${vocab.component_role.join(', ')}`);
      for (const k of Object.keys(c ?? {})) if (!['part', 'role', 'manufacturer', 'model', 'versions', 'serial', 'detail', 'inferred'].includes(k)) err(cat, `unknown field ${k}`);
      // Best guesses live apart from published facts and must show their evidence.
      const g = c?.inferred;
      if (g) {
        if (!g.manufacturer && !g.model) err(cat, 'inferred needs a manufacturer or model');
        if (g.manufacturer && c.manufacturer) err(cat, 'inferred.manufacturer is only for when no source publishes the manufacturer');
        if (g.model && c.model) err(cat, 'inferred.model is only for when no source publishes the model');
        if (!['likely', 'suspected'].includes(g.confidence)) err(cat, 'inferred.confidence must be likely or suspected');
        if (!g.reasoning) err(cat, 'inferred.reasoning is required');
        if (!Array.isArray(g.evidence) || !g.evidence.length) err(cat, 'inferred.evidence needs at least one item');
        for (const e of g.evidence ?? []) {
          if (!e?.publisher || !e?.supports) err(cat, 'each inferred.evidence item needs publisher and supports');
          if (!/^https:\/\//.test(e?.url ?? '')) err(cat, 'each inferred.evidence item needs an https url');
        }
        for (const k of Object.keys(g)) if (!['manufacturer', 'model', 'confidence', 'reasoning', 'evidence'].includes(k)) err(cat, `unknown field inferred.${k}`);
      }
    }
  }
  for (const [j, f] of (inc.supply_chain_factors ?? []).entries()) {
    const fat = `${at} supply_chain_factors[${j}]`;
    if (!f?.factor) err(fat, 'factor is required');
    if (!vocab.confidence.includes(f?.confidence)) err(fat, `confidence must be one of ${vocab.confidence.join(', ')}`);
    if (f?.component && !componentIds.has(f.component)) err(fat, `component "${f.component}" is not an id in supply-chain.yaml`);
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
// Stamp asset links with a build version. Pages caches files for 10 minutes, so without this a
// returning visitor can get new HTML with an old script right after a deploy.
const version = (process.env.GITHUB_SHA ?? Date.now().toString(36)).slice(0, 10);
const indexPath = path.join(out, 'index.html');
fs.writeFileSync(indexPath, fs.readFileSync(indexPath, 'utf8')
  .replace(/(href|src)="(style\.css|app\.js)"/g, `$1="$2?v=${version}"`));
fs.mkdirSync(path.join(out, 'data'), { recursive: true });
const sorted = incidents.map((x) => ({ ...x, date: iso(x.date) })).sort((a, b) => b.date.localeCompare(a.date));
const write = (f, v) => fs.writeFileSync(path.join(out, 'data', f), JSON.stringify(v));
write('incidents.json', sorted);
// A component's linked incidents = its hand-listed ones plus any incident whose supply_chain_factors name it.
const components = supply.components.map((c) => ({
  ...c,
  related_incidents: [...new Set([
    ...(c.related_incidents ?? []),
    ...sorted.filter((i) => (i.supply_chain_factors ?? []).some((f) => f.component === c.id)).map((i) => i.id),
  ])],
}));
write('supply-chain.json', { ...supply, as_of: iso(supply.as_of), components });
write('headlines.json', headlines.map((h) => ({ ...h, date: iso(h.date) })));
write('vocabulary.json', vocab);

// Atom feed of incidents, newest first, for feed readers and SOC tooling.
const SITE = 'https://knapply.github.io/data-center-security/';
const xml = (s) => String(s ?? '').replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]);
const stamp = (d) => `${d}T00:00:00Z`;
const entries = sorted.slice(0, 50).map((i) => {
  const link = `${SITE}#${i.id}`;
  const body = [i.summary, i.root_cause && `Root cause (${i.root_cause.confidence}): ${i.root_cause.summary}`,
    `Severity: ${i.severity}. Location: ${i.location ? `${i.location.city}, ${i.location.country}` : 'global'}.`].filter(Boolean).join('\n\n');
  return `  <entry>
    <id>${xml(link)}</id>
    <title>${xml(`[${i.severity}] ${i.title}`)}</title>
    <link href="${xml(link)}"/>
    <updated>${stamp(i.date)}</updated>
    ${i.category.map((c) => `<category term="${xml(c)}"/>`).join('')}
    <summary>${xml(body)}</summary>
  </entry>`;
});
fs.writeFileSync(path.join(out, 'feed.xml'), `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Data Center Watch</title>
  <subtitle>Curated security incidents and industry developments across data centers and digital infrastructure</subtitle>
  <id>${SITE}</id>
  <link href="${SITE}"/>
  <link rel="self" href="${SITE}feed.xml"/>
  <updated>${stamp(sorted[0]?.date ?? iso(new Date()))}</updated>
  <author><name>Data Center Watch</name></author>
${entries.join('\n')}
</feed>
`);
console.log('Built _site/');
