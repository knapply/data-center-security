const CATS = [
  { id: 'physical', label: 'Physical' },
  { id: 'it-ot', label: 'IT / OT / SCADA' },
  { id: 'supply-chain', label: 'Supply chain' },
];
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const catColor = (c) => css(`--${c}`);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
const fmtDate = (inc) => inc.date_precision === 'month' ? inc.date.slice(0, 7) : inc.date;

const [incidents, supply, headlines] = await Promise.all(
  ['incidents', 'supply-chain', 'headlines'].map((f) => fetch(`data/${f}.json`).then((r) => r.json())),
);
const active = new Set(CATS.map((c) => c.id));
const visible = () => incidents.filter((i) => i.category.some((c) => active.has(c)));

document.getElementById('seed-banner').hidden = !incidents.some((i) => i.seed);

// Ticker: curated headlines, falling back to the latest incidents.
const tickerItems = (headlines.length ? headlines : incidents.slice(0, 10).map((i) => ({
  date: i.date, title: i.title, url: `#${i.id}`, category: i.category[0],
}))).map((h) => `<a href="${esc(h.url)}"><span class="dot" style="background:${catColor(h.category)}"></span>${esc(h.title)}</a>`).join('');
document.getElementById('ticker').innerHTML = tickerItems + tickerItems; // doubled for a seamless loop

// Category filter chips
const filters = document.getElementById('filters');
filters.innerHTML = CATS.map((c) => `<button class="chip" aria-pressed="true" data-cat="${c.id}"><span class="swatch" style="background:${catColor(c.id)}"></span>${c.label}</button>`).join('');
filters.addEventListener('click', (e) => {
  const b = e.target.closest('.chip');
  if (!b) return;
  const on = b.getAttribute('aria-pressed') === 'true';
  if (on && active.size === 1) return; // keep at least one category
  b.setAttribute('aria-pressed', String(!on));
  on ? active.delete(b.dataset.cat) : active.add(b.dataset.cat);
  render();
});

// Map
const map = L.map('leaflet', { worldCopyJump: true, scrollWheelZoom: false }).setView([25, 15], 2);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors', maxZoom: 10,
}).addTo(map);
const markers = L.layerGroup().addTo(map);
const radius = { low: 5, medium: 7, high: 9, critical: 11 };

function renderMap(list) {
  markers.clearLayers();
  for (const i of list.filter((x) => x.location)) {
    L.circleMarker([i.location.lat, i.location.lon], {
      radius: radius[i.severity] ?? 7, color: catColor(i.category[0]), fillColor: catColor(i.category[0]), fillOpacity: 0.55, weight: 1.5,
    }).bindPopup(`<strong>${esc(i.title)}</strong><br>${esc(i.location.city)} · ${fmtDate(i)} · ${i.severity}<br><a href="#${i.id}">Details</a>`).addTo(markers);
  }
  const off = list.filter((x) => !x.location).length;
  document.getElementById('unmapped').textContent = off ? `${off} entr${off === 1 ? 'y has' : 'ies have'} no single location (advisories, policy) and appear in the list below.` : '';
}

function renderStats(list) {
  const n = (c) => list.filter((i) => i.category.includes(c)).length;
  const cards = [
    ['Tracked entries', list.length],
    ['Physical', n('physical')],
    ['IT / OT / SCADA', n('it-ot')],
    ['Supply chain', n('supply-chain')],
    [`Critical or high`, list.filter((i) => ['critical', 'high'].includes(i.severity)).length],
  ];
  document.getElementById('stats').innerHTML = cards.map(([l, v]) => `<div class="stat"><div class="label">${l}</div><div class="value">${v}</div></div>`).join('');
}

function renderSupply() {
  document.getElementById('supply-list').innerHTML = supply.components.map((c) => `
    <li><span class="name">${esc(c.name)}</span>
      <span class="level ${c.level}">${c.level}${c.trend === 'up' ? ' ↑' : c.trend === 'down' ? ' ↓' : ''}</span>
      <span class="note">${esc(c.note)}${c.related_incidents?.length ? ` <a href="#incidents" data-component="${c.id}">${c.related_incidents.length} linked incident${c.related_incidents.length === 1 ? '' : 's'}</a>` : ''}</span></li>`).join('');
  document.getElementById('supply-asof').textContent = `Assessment as of ${supply.as_of}${supply.seed ? ' (seed, pending review)' : ''}.`;
}

function renderSankey(list) {
  const svg = d3.select('#sankey');
  svg.selectAll('*').remove();
  const W = 900, H = 360;
  svg.attr('viewBox', `0 0 ${W} ${H}`);
  const links = new Map();
  const add = (s, t) => links.set(`${s}|${t}`, (links.get(`${s}|${t}`) ?? 0) + 1);
  for (const i of list) {
    for (const c of i.category) if (active.has(c)) for (const a of i.affects) add(`c:${c}`, `a:${a}`);
    for (const a of i.affects) for (const m of i.impacts) add(`a:${a}`, `i:${m}`);
  }
  const names = [...new Set([...links.keys()].flatMap((k) => k.split('|')))];
  if (!names.length) return;
  const graph = d3.sankey().nodeId((d) => d.id).nodeWidth(12).nodePadding(12).extent([[1, 8], [W - 1, H - 8]])({
    nodes: names.map((id) => ({ id })),
    links: [...links].map(([k, value]) => { const [source, target] = k.split('|'); return { source, target, value }; }),
  });
  const color = (id) => id.startsWith('c:') ? catColor(id.slice(2)) : css('--system');
  svg.append('g').attr('fill', 'none').selectAll('path').data(graph.links).join('path')
    .attr('d', d3.sankeyLinkHorizontal()).attr('stroke', (d) => color(d.source.id)).attr('stroke-opacity', 0.35)
    .attr('stroke-width', (d) => Math.max(1, d.width))
    .append('title').text((d) => `${d.source.id.slice(2)} → ${d.target.id.slice(2)}: ${d.value}`);
  const node = svg.append('g').selectAll('g').data(graph.nodes).join('g');
  node.append('rect').attr('x', (d) => d.x0).attr('y', (d) => d.y0).attr('width', (d) => d.x1 - d.x0)
    .attr('height', (d) => Math.max(1, d.y1 - d.y0)).attr('rx', 2).attr('fill', (d) => color(d.id));
  node.append('text').attr('x', (d) => (d.x0 < W / 2 ? d.x1 + 6 : d.x0 - 6)).attr('y', (d) => (d.y0 + d.y1) / 2)
    .attr('dy', '0.35em').attr('text-anchor', (d) => (d.x0 < W / 2 ? 'start' : 'end'))
    .text((d) => `${CATS.find((c) => `c:${c.id}` === d.id)?.label ?? d.id.slice(2)} (${d.value})`);
}

let sim;
function renderNetwork(list) {
  const svg = d3.select('#network');
  svg.selectAll('*').remove();
  sim?.stop();
  const W = 900, H = 460;
  svg.attr('viewBox', `0 0 ${W} ${H}`);
  const nodes = new Map(), links = [];
  const node = (id, kind, label, extra = {}) => nodes.get(id) ?? nodes.set(id, { id, kind, label, ...extra }).get(id);
  for (const i of list) {
    node(i.id, 'incident', i.title, { cat: i.category[0], sev: i.severity });
    for (const a of i.affects) { node(`s:${a}`, 'system', a); links.push({ source: i.id, target: `s:${a}` }); }
    const makers = (i.root_cause?.components ?? []).map((c) => c.manufacturer).filter(Boolean);
    for (const p of new Set([...(i.vendors ?? []), ...(i.operators ?? []), ...makers])) { node(`p:${p}`, 'party', p); links.push({ source: i.id, target: `p:${p}` }); }
  }
  const data = [...nodes.values()];
  const fill = (d) => d.kind === 'incident' ? catColor(d.cat) : d.kind === 'system' ? css('--system') : css('--party');
  const r = (d) => d.kind === 'system' ? 9 : d.kind === 'party' ? 6 : 5 + ({ critical: 3, high: 2, medium: 1 }[d.sev] ?? 0);
  sim = d3.forceSimulation(data)
    .force('link', d3.forceLink(links).id((d) => d.id).distance(45).strength(0.6))
    .force('charge', d3.forceManyBody().strength(-110))
    .force('center', d3.forceCenter(W / 2, H / 2))
    .force('collide', d3.forceCollide((d) => r(d) + 3));
  const link = svg.append('g').attr('stroke', css('--border')).attr('stroke-width', 1.2).selectAll('line').data(links).join('line');
  const g = svg.append('g').selectAll('g').data(data).join('g').style('cursor', 'grab')
    .call(d3.drag()
      .on('start', (e, d) => { if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
      .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y; })
      .on('end', (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }));
  g.append('circle').attr('r', r).attr('fill', fill).attr('stroke', css('--surface')).attr('stroke-width', 1.5);
  g.append('title').text((d) => d.label);
  g.filter((d) => d.kind !== 'incident').append('text').attr('x', (d) => r(d) + 4).attr('dy', '0.35em').text((d) => d.label);
  sim.on('tick', () => {
    for (const d of data) { d.x = Math.max(12, Math.min(W - 12, d.x)); d.y = Math.max(12, Math.min(H - 12, d.y)); }
    link.attr('x1', (d) => d.source.x).attr('y1', (d) => d.source.y).attr('x2', (d) => d.target.x).attr('y2', (d) => d.target.y);
    g.attr('transform', (d) => `translate(${d.x},${d.y})`);
  });
}

const componentName = (id) => supply.components.find((c) => c.id === id)?.name ?? id;
function renderGuess(g) {
  const what = [g.manufacturer, g.model].filter(Boolean).map(esc).join(' ');
  return `<div class="guess">
    <div><span class="k">Best guess</span> equipment likely supplied by <strong>${what}</strong> <span class="tag conf-${g.confidence}">${g.confidence}</span></div>
    <div class="muted small">Not confirmed by any source, and not a finding that this supplier caused the failure.</div>
    <details><summary>Why we think so</summary>
      <p>${esc(g.reasoning)}</p>
      <ul>${g.evidence.map((e) => `<li><a href="${esc(e.url)}" rel="noopener">${esc(e.publisher)}</a>: ${esc(e.supports)}</li>`).join('')}</ul>
    </details>
  </div>`;
}

function renderCause(i) {
  const rc = i.root_cause, fx = i.supply_chain_factors ?? [];
  if (!rc && !fx.length) return '';
  const field = (label, v) => v ? `<span><span class="k">${label}</span> ${esc(Array.isArray(v) ? v.join(', ') : v)}</span>` : '';
  const parts = (rc?.components ?? []).map((c) => `
    <li><strong>${esc(c.part)}</strong>${c.role ? ` <span class="tag">${c.role}</span>` : ''}
      <div class="fields">${field('Maker', c.manufacturer)}${field('Model', c.model)}${field('Versions', c.versions)}${field('Serial', c.serial)}</div>
      ${c.detail ? `<div class="muted">${esc(c.detail)}</div>` : ''}
      ${c.inferred ? renderGuess(c.inferred) : ''}</li>`).join('');
  const factors = fx.map((f) => `<li>${esc(f.factor)} <span class="tag conf-${f.confidence}">${f.confidence}</span>${f.component ? ` <span class="muted">· ${esc(componentName(f.component))}</span>` : ''}</li>`).join('');
  return `<details class="cause"><summary>Root cause${rc ? ` <span class="tag conf-${rc.confidence}">${rc.confidence}</span>` : ''}${fx.length ? ` · ${fx.length} supply chain factor${fx.length === 1 ? '' : 's'}` : ''}</summary>
    ${rc ? `<p>${esc(rc.summary)}</p>` : ''}
    ${parts ? `<ul class="parts">${parts}</ul>` : ''}
    ${factors ? `<div class="k">Supply chain factors</div><ul class="factors">${factors}</ul>` : ''}
  </details>`;
}

function renderList(list) {
  document.getElementById('incident-list').innerHTML = list.map((i) => `
    <article class="inc" id="${esc(i.id)}">
      <div class="inc-head">
        <span class="inc-title">${esc(i.title)}</span>
        <span class="tag sev-${i.severity}">${i.severity}</span>
        <span class="tag">${i.type}</span>
        ${i.status !== 'confirmed' ? `<span class="tag">${i.status}</span>` : ''}
      </div>
      <div class="inc-meta">${fmtDate(i)} · ${i.location ? esc(`${i.location.city}, ${i.location.country}`) : 'Global'} · ${i.category.map((c) => CATS.find((x) => x.id === c).label).join(', ')}</div>
      <p>${esc(i.summary)}</p>
      ${renderCause(i)}
      <div class="sources">Sources: ${i.sources.map((s) => s.url ? `<a href="${esc(s.url)}" rel="noopener">${esc(s.publisher)}</a>` : esc(s.publisher)).join(', ')}${i.sources.every((s) => !s.url) ? ' · links pending' : ''}</div>
    </article>`).join('');
}

function render() {
  const list = visible();
  renderStats(list);
  renderMap(list);
  renderSankey(list);
  renderNetwork(list);
  renderList(list);
}
renderSupply();
render();
