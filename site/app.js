const CATS = [
  { id: 'physical', label: 'Physical' },
  { id: 'it-ot', label: 'IT / OT / SCADA' },
  { id: 'supply-chain', label: 'Supply chain' },
];
const SEV = { low: 0, medium: 1, high: 2, critical: 3 };
const SEV_PX = { low: 12, medium: 15, high: 19, critical: 24 };
const DAY = 864e5;
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const catColor = (c) => css(`--${c}`);
const catLabel = (c) => CATS.find((x) => x.id === c)?.label ?? c;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
const pretty = (s) => String(s).replace(/-/g, ' ');
const toDate = (s) => new Date(`${s}T00:00:00Z`);
const fmtDate = (i) => toDate(i.date).toLocaleDateString('en-US', i.date_precision === 'month'
  ? { year: 'numeric', month: 'short', timeZone: 'UTC' } : { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
const place = (i) => (i.location ? `${i.location.city}, ${i.location.country}` : 'Global');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const [incidents, supply, headlines] = await Promise.all(
  ['incidents', 'supply-chain', 'headlines'].map((f) => fetch(`data/${f}.json`).then((r) => r.json())),
);
const byId = new Map(incidents.map((i) => [i.id, i]));
const state = { cats: new Set(CATS.map((c) => c.id)), minSev: 'low', q: '', component: null, until: Infinity };

const matches = (i) =>
  i.category.some((c) => state.cats.has(c)) &&
  SEV[i.severity] >= SEV[state.minSev] &&
  (!state.component || supply.components.find((c) => c.id === state.component)?.related_incidents.includes(i.id)) &&
  (!state.q || [i.title, i.summary, place(i), ...(i.operators ?? []), ...(i.vendors ?? []),
    ...(i.root_cause?.components ?? []).flatMap((c) => [c.part, c.manufacturer, c.model])]
    .join(' ').toLowerCase().includes(state.q));
const visible = () => incidents.filter(matches);

document.getElementById('seed-banner').hidden = !incidents.some((i) => i.seed);

// ---------- Small helpers ----------
const tip = document.getElementById('tooltip');
function showTip(e, html) {
  tip.innerHTML = html; tip.hidden = false;
  const x = Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 8);
  const y = e.clientY + 14 + tip.offsetHeight > innerHeight ? e.clientY - tip.offsetHeight - 10 : e.clientY + 14;
  tip.style.left = `${x}px`; tip.style.top = `${y}px`;
}
const hideTip = () => { tip.hidden = true; };
const incTip = (i) => `<strong>${esc(i.title)}</strong><span class="meta">${fmtDate(i)} · ${esc(place(i))} · ${i.severity}</span>`;

function countUp(el, to) {
  if (reduceMotion || el.dataset.done) { el.textContent = to; return; }
  el.dataset.done = '1';
  const start = performance.now();
  const step = (t) => {
    const p = Math.min(1, (t - start) / 1100);
    el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function jumpTo(id) {
  const card = document.getElementById(id);
  if (!card) return;
  card.querySelector('details.cause')?.setAttribute('open', '');
  card.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  card.classList.remove('flash'); void card.offsetWidth; card.classList.add('flash');
}

// ---------- Header status and ticker ----------
const latest = [...incidents.map((i) => i.date), ...headlines.map((h) => h.date)].sort().at(-1);
const daysAgo = latest ? Math.round((Date.now() - toDate(latest)) / DAY) : null;
document.getElementById('status-text').textContent = daysAgo === null ? 'Monitoring' : `Monitoring · last event ${daysAgo}d ago`;

const tickerSrc = headlines.length ? headlines : incidents.slice(0, 10).map((i) => ({ date: i.date, title: i.title, url: `#${i.id}`, category: i.category[0] }));
const tickerHtml = tickerSrc.map((h) => `<a href="${esc(h.url)}" ${h.url.startsWith('#') ? '' : 'target="_blank" rel="noopener"'}>
  <span class="dot" style="background:${catColor(h.category)};color:${catColor(h.category)}"></span>
  <time>${toDate(h.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}</time>${esc(h.title)}</a>`).join('');
document.getElementById('ticker').innerHTML = tickerHtml + tickerHtml; // doubled for a seamless loop

// ---------- Filters ----------
const filters = document.getElementById('filters');
filters.innerHTML = CATS.map((c) => `<button class="chip" aria-pressed="true" data-cat="${c.id}" style="--c:${catColor(c.id)}"><span class="swatch"></span>${c.label}</button>`).join('');
filters.addEventListener('click', (e) => {
  const b = e.target.closest('.chip');
  if (!b) return;
  const on = b.getAttribute('aria-pressed') === 'true';
  if (on && state.cats.size === 1) return; // keep at least one category
  b.setAttribute('aria-pressed', String(!on));
  on ? state.cats.delete(b.dataset.cat) : state.cats.add(b.dataset.cat);
  render();
});
document.getElementById('sev-filter').addEventListener('change', (e) => { state.minSev = e.target.value; render(); });
let qTimer;
document.getElementById('search').addEventListener('input', (e) => {
  clearTimeout(qTimer);
  qTimer = setTimeout(() => { state.q = e.target.value.trim().toLowerCase(); render(); }, 150);
});

// ---------- KPIs ----------
function renderStats(list) {
  const n = (c) => list.filter((i) => i.category.includes(c)).length;
  const countries = new Set(list.filter((i) => i.location).map((i) => i.location.country)).size;
  const cards = [
    ['Tracked incidents', list.length, `${n('physical')} physical · ${n('it-ot')} IT/OT · ${n('supply-chain')} supply`, css('--accent')],
    ['Critical or high', list.filter((i) => SEV[i.severity] >= 2).length, 'Multi-hour outages or remote takeover', css('--critical')],
    ['Countries hit', countries, 'Plus global advisories and policy', css('--party')],
    ['Root causes traced', list.filter((i) => i.root_cause && i.root_cause.confidence !== 'unknown').length, 'Failed part identified from sources', css('--ok')],
  ];
  const el = document.getElementById('stats');
  if (!el.children.length) el.innerHTML = cards.map(([l, , s, c]) => `<div class="kpi" style="--c:${c}"><div class="label">${l}</div><div class="value">0</div><div class="sub">${s}</div></div>`).join('');
  [...el.children].forEach((k, idx) => {
    countUp(k.querySelector('.value'), cards[idx][1]);
    k.querySelector('.sub').textContent = cards[idx][2];
  });
}

// ---------- Map with playback ----------
const map = L.map('leaflet', { worldCopyJump: true, scrollWheelZoom: false, minZoom: 2, zoomSnap: 0.5 }).setView([28, 25], 2.5);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors', maxZoom: 10,
}).addTo(map);
const markers = L.layerGroup().addTo(map);
const markerById = new Map(); // only add and remove what changed, so pulses and clicks survive playback

const dated = incidents.map((i) => +toDate(i.date));
const t0 = Math.min(...dated) - 60 * DAY, t1 = Date.now();
const timeEl = document.getElementById('time');
timeEl.max = 1000; timeEl.value = 1000;
const sliderToTime = (v) => t0 + (v / 1000) * (t1 - t0);

function renderMap(list) {
  const onMap = list.filter((i) => i.location && +toDate(i.date) <= state.until);
  const want = new Set(onMap.map((i) => i.id));
  for (const [id, m] of markerById) if (!want.has(id)) { markers.removeLayer(m); markerById.delete(id); }
  for (const i of onMap) {
    if (markerById.has(i.id)) continue;
    const s = SEV_PX[i.severity] ?? 15, c = catColor(i.category[0]);
    const rings = SEV[i.severity] >= 2 ? '<span class="ring"></span><span class="ring r2"></span>' : '<span class="ring"></span>';
    const icon = L.divIcon({
      className: '', iconSize: [s, s],
      html: `<div class="blip new" style="--c:${c};width:${s}px;height:${s}px">${rings}<span class="core"></span></div>`,
    });
    markerById.set(i.id, L.marker([i.location.lat, i.location.lon], { icon, title: i.title, riseOnHover: true })
      .on('click', () => showDetail(i)).addTo(markers));
  }
  const off = list.filter((x) => !x.location).length;
  document.getElementById('unmapped').textContent = off ? `${off} advisory or policy entr${off === 1 ? 'y' : 'ies'} with no single location appear in the list below` : '';
  const through = Number.isFinite(state.until) ? new Date(state.until) : new Date(t1);
  document.getElementById('time-label').textContent =
    `${through.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} · ${onMap.length} on map`;
}

const detail = document.getElementById('map-detail');
function showDetail(i) {
  const c = catColor(i.category[0]);
  detail.style.setProperty('--c', c);
  detail.innerHTML = `
    <button class="close" aria-label="Close">×</button>
    <div class="card-top"><span class="tag sev" style="--sc:var(--${i.severity})">${i.severity}</span><span class="tag" style="color:${c}">${catLabel(i.category[0])}</span></div>
    <h3>${esc(i.title)}</h3>
    <div class="meta">${fmtDate(i)} · ${esc(place(i))}</div>
    <p>${esc(i.summary)}</p>
    ${i.root_cause ? `<p><span class="tag">Cause</span> ${esc(i.root_cause.summary)}</p>` : ''}
    <a href="#${esc(i.id)}" class="more">Full details and sources ↓</a>`;
  detail.hidden = false;
  detail.querySelector('.close').onclick = () => { detail.hidden = true; };
  detail.querySelector('.more').onclick = (e) => { e.preventDefault(); jumpTo(i.id); };
}

let playing = null;
const playBtn = document.getElementById('play'), playIcon = document.getElementById('play-icon');
const setPlayIcon = (on) => playIcon.setAttribute('d', on ? 'M7 5h4v14H7zM13 5h4v14h-4z' : 'M8 5v14l11-7z');
function stopPlay() { cancelAnimationFrame(playing); playing = null; setPlayIcon(false); }
playBtn.addEventListener('click', () => {
  if (playing) return stopPlay();
  if (+timeEl.value >= 1000) timeEl.value = 0;
  setPlayIcon(true);
  let last = performance.now();
  const step = (t) => {
    timeEl.value = Math.min(1000, +timeEl.value + (t - last) / 9); // about 9 s for the full history
    last = t;
    state.until = sliderToTime(+timeEl.value);
    renderMap(visible());
    if (+timeEl.value >= 1000) { state.until = Infinity; return stopPlay(); }
    playing = requestAnimationFrame(step);
  };
  playing = requestAnimationFrame(step);
});
timeEl.addEventListener('input', () => {
  stopPlay();
  state.until = +timeEl.value >= 1000 ? Infinity : sliderToTime(+timeEl.value);
  renderMap(visible());
});

// ---------- Timeline (beeswarm) ----------
function renderBeeswarm(list) {
  const svg = d3.select('#beeswarm');
  svg.selectAll('*').remove();
  const W = 1160, H = 170, M = { l: 20, r: 20, b: 28 };
  svg.attr('viewBox', `0 0 ${W} ${H}`);
  const x = d3.scaleUtc().domain([new Date(t0), new Date(t1)]).range([M.l, W - M.r]);
  const r = (i) => SEV_PX[i.severity] / 2 + 1;
  const nodes = list.map((i) => ({ i, x: x(toDate(i.date)), y: (H - M.b) / 2 }));
  const sim = d3.forceSimulation(nodes)
    .force('x', d3.forceX((d) => x(toDate(d.i.date))).strength(1))
    .force('y', d3.forceY((H - M.b) / 2).strength(0.06))
    .force('collide', d3.forceCollide((d) => r(d.i) + 1.5)).stop();
  for (let k = 0; k < 200; k++) sim.tick();

  const yearTicks = d3.utcYear.range(d3.utcYear.ceil(new Date(t0)), new Date(t1));
  svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - M.b})`)
    .call(d3.axisBottom(x).tickValues(yearTicks).tickFormat(d3.utcFormat('%Y')).tickSize(-(H - M.b - 10)))
    .call((g) => g.select('.domain').remove())
    .call((g) => g.selectAll('.tick line').attr('stroke-dasharray', '2 4').attr('stroke-opacity', 0.6));
  svg.append('g').selectAll('circle').data(nodes).join('circle')
    .attr('class', 'dot-inc').attr('cx', (d) => d.x).attr('cy', (d) => d.y)
    .attr('r', reduceMotion ? (d) => r(d.i) : 0)
    .attr('fill', (d) => catColor(d.i.category[0])).attr('fill-opacity', 0.85)
    .attr('stroke', (d) => catColor(d.i.category[0])).attr('stroke-width', 6).attr('stroke-opacity', 0.15)
    .on('mousemove', (e, d) => showTip(e, incTip(d.i)))
    .on('mouseleave', hideTip)
    .on('click', (e, d) => { hideTip(); jumpTo(d.i.id); })
    .transition().delay((d, k) => k * 40).duration(500).attr('r', (d) => r(d.i));
}

// ---------- Supply chain meters ----------
const LEVEL = { normal: 1, elevated: 2, high: 3 };
const LEVEL_COLOR = { normal: 'var(--ok)', elevated: 'var(--medium)', high: 'var(--critical)' };
function renderSupply() {
  document.getElementById('supply-list').innerHTML = supply.components.map((c) => {
    const n = c.related_incidents?.length ?? 0;
    return `<li style="--lc:${LEVEL_COLOR[c.level]}">
      <div class="meter-top"><span class="meter-name">${esc(c.name)}</span>
        <span class="meter-level">${c.level}${c.trend === 'up' ? ' ▲' : c.trend === 'down' ? ' ▼' : ''}</span></div>
      <div class="bar">${[1, 2, 3].map((k) => `<span class="${k <= LEVEL[c.level] ? 'on' : ''}"></span>`).join('')}</div>
      <div class="meter-note">${esc(c.note)}${n ? ` <a href="#incidents" data-component="${c.id}">${n} linked incident${n === 1 ? '' : 's'} →</a>` : ''}</div>
    </li>`;
  }).join('');
  document.getElementById('supply-asof').textContent = `As of ${supply.as_of}${supply.seed ? ' · some notes pending sources' : ''}`;
}
document.getElementById('supply-list').addEventListener('click', (e) => {
  const a = e.target.closest('[data-component]');
  if (!a) return;
  e.preventDefault();
  state.component = a.dataset.component;
  render();
  document.getElementById('incidents').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
});

// ---------- Sankey ----------
function renderSankey(list) {
  const svg = d3.select('#sankey');
  svg.selectAll('*').remove();
  const W = 1160, H = 440;
  svg.attr('viewBox', `0 0 ${W} ${H}`);
  const links = new Map();
  const add = (s, t) => links.set(`${s}|${t}`, (links.get(`${s}|${t}`) ?? 0) + 1);
  for (const i of list) {
    for (const c of i.category) if (state.cats.has(c)) for (const a of i.affects) add(`c:${c}`, `a:${a}`);
    for (const a of i.affects) for (const m of i.impacts) add(`a:${a}`, `i:${m}`);
  }
  const names = [...new Set([...links.keys()].flatMap((k) => k.split('|')))];
  if (!names.length) return;
  const graph = d3.sankey().nodeId((d) => d.id).nodeWidth(12).nodePadding(14).extent([[150, 6], [W - 190, H - 6]])({
    nodes: names.map((id) => ({ id })),
    links: [...links].map(([k, value]) => { const [source, target] = k.split('|'); return { source, target, value }; }),
  });
  const color = (id) => id.startsWith('c:') ? catColor(id.slice(2)) : id.startsWith('i:') ? css('--critical') : css('--system');
  const defs = svg.append('defs');
  graph.links.forEach((l, k) => {
    const g = defs.append('linearGradient').attr('id', `lg${k}`).attr('gradientUnits', 'userSpaceOnUse')
      .attr('x1', l.source.x1).attr('x2', l.target.x0);
    g.append('stop').attr('offset', '0%').attr('stop-color', color(l.source.id));
    g.append('stop').attr('offset', '100%').attr('stop-color', color(l.target.id));
  });
  const link = svg.append('g').attr('fill', 'none').selectAll('path').data(graph.links).join('path')
    .attr('class', 'sankey-link').attr('d', d3.sankeyLinkHorizontal())
    .attr('stroke', (d, k) => `url(#lg${k})`).attr('stroke-width', (d) => Math.max(1.5, d.width))
    .attr('stroke-opacity', reduceMotion ? 0.4 : 0)
    .on('mousemove', (e, d) => showTip(e, `<strong>${esc(pretty(d.source.id.slice(2)))} → ${esc(pretty(d.target.id.slice(2)))}</strong>${d.value} incident${d.value === 1 ? '' : 's'}`))
    .on('mouseleave', hideTip);
  link.transition().delay((d, k) => 150 + k * 25).duration(600).attr('stroke-opacity', 0.4);
  const node = svg.append('g').selectAll('g').data(graph.nodes).join('g').style('cursor', 'pointer');
  node.append('rect').attr('x', (d) => d.x0).attr('y', (d) => d.y0).attr('width', (d) => d.x1 - d.x0)
    .attr('height', (d) => Math.max(2, d.y1 - d.y0)).attr('rx', 3).attr('fill', (d) => color(d.id))
    .style('filter', (d) => `drop-shadow(0 0 6px ${color(d.id)})`);
  node.append('text').attr('x', (d) => (d.depth === 0 ? d.x0 - 8 : d.depth === 2 ? d.x1 + 8 : d.x1 + 6))
    .attr('y', (d) => (d.y0 + d.y1) / 2).attr('dy', '0.35em')
    .attr('text-anchor', (d) => (d.depth === 0 ? 'end' : 'start'))
    .text((d) => `${d.id.startsWith('c:') ? catLabel(d.id.slice(2)) : pretty(d.id.slice(2))} ${d.value}`);
  const connected = (d, l) => l.source === d || l.target === d;
  node.on('mouseenter', (e, d) => link.attr('stroke-opacity', (l) => connected(d, l) ? 0.75 : 0.06))
    .on('mouseleave', () => link.attr('stroke-opacity', 0.4));
}

// ---------- Network ----------
let sim;
function renderNetwork(list) {
  const svg = d3.select('#network');
  svg.selectAll('*').remove();
  sim?.stop();
  const W = 1160, H = 600;
  svg.attr('viewBox', `0 0 ${W} ${H}`);
  const glow = svg.append('defs').append('filter').attr('id', 'glow').attr('x', '-50%').attr('y', '-50%').attr('width', '200%').attr('height', '200%');
  glow.append('feGaussianBlur').attr('stdDeviation', 3).attr('result', 'b');
  const merge = glow.append('feMerge'); merge.append('feMergeNode').attr('in', 'b'); merge.append('feMergeNode').attr('in', 'SourceGraphic');

  const nodes = new Map(), links = [];
  const node = (id, kind, label, extra = {}) => nodes.get(id) ?? nodes.set(id, { id, kind, label, ...extra }).get(id);
  for (const i of list) {
    node(i.id, 'incident', i.title, { inc: i });
    for (const a of i.affects) { node(`s:${a}`, 'system', pretty(a)); links.push({ source: i.id, target: `s:${a}` }); }
    const makers = (i.root_cause?.components ?? []).map((c) => c.manufacturer).filter(Boolean);
    for (const p of new Set([...(i.vendors ?? []), ...(i.operators ?? []), ...makers])) { node(`p:${p}`, 'party', p); links.push({ source: i.id, target: `p:${p}` }); }
  }
  const data = [...nodes.values()];
  const fill = (d) => d.kind === 'incident' ? catColor(d.inc.category[0]) : d.kind === 'system' ? css('--system') : css('--party');
  const r = (d) => d.kind === 'system' ? 11 : d.kind === 'party' ? 5 : SEV_PX[d.inc.severity] / 2 + 1;
  sim = d3.forceSimulation(data)
    .force('link', d3.forceLink(links).id((d) => d.id).distance((l) => l.target.kind === 'party' ? 70 : 60).strength(0.4))
    .force('charge', d3.forceManyBody().strength(-120))
    .force('center', d3.forceCenter(W / 2, H / 2))
    .force('x', d3.forceX(W / 2).strength(0.02))
    .force('y', d3.forceY(H / 2).strength(0.08)) // keeps labels off the top and bottom edges
    // Labelled nodes get a wider berth so their text doesn't pile up.
    .force('collide', d3.forceCollide((d) => r(d) + (d.kind === 'incident' ? 4 : Math.min(d.label.length * 3.4, 48))).iterations(2));
  const link = svg.append('g').selectAll('line').data(links).join('line')
    .attr('class', 'net-link').attr('stroke', css('--border-strong')).attr('stroke-width', 1);
  const g = svg.append('g').selectAll('g').data(data).join('g').attr('class', 'net-node').style('cursor', 'grab')
    .call(d3.drag()
      .on('start', (e, d) => { if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
      .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y; })
      .on('end', (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }));
  g.append('circle').attr('r', r).attr('fill', fill).attr('fill-opacity', (d) => d.kind === 'system' ? 0.25 : 0.95)
    .attr('stroke', fill).attr('stroke-width', (d) => d.kind === 'system' ? 1.5 : 0)
    .attr('filter', (d) => d.kind === 'incident' ? 'url(#glow)' : null);
  g.filter((d) => d.kind !== 'incident').append('text').attr('x', (d) => r(d) + 5).attr('dy', '0.35em')
    .attr('fill', (d) => d.kind === 'party' ? css('--party') : css('--text'))
    .style('font-size', (d) => d.kind === 'system' ? '13px' : '11px').style('font-weight', (d) => d.kind === 'system' ? 600 : 400)
    .text((d) => d.label);

  const neighbors = new Map(data.map((d) => [d.id, new Set([d.id])]));
  for (const l of links) { neighbors.get(l.source.id ?? l.source).add(l.target.id ?? l.target); neighbors.get(l.target.id ?? l.target).add(l.source.id ?? l.source); }
  g.on('mouseenter', (e, d) => {
    const near = neighbors.get(d.id);
    g.style('opacity', (n) => near.has(n.id) ? 1 : 0.15);
    link.style('opacity', (l) => l.source.id === d.id || l.target.id === d.id ? 1 : 0.05)
      .attr('stroke', (l) => l.source.id === d.id || l.target.id === d.id ? fill(d) : css('--border-strong'));
  }).on('mousemove', (e, d) => d.kind === 'incident' && showTip(e, incTip(d.inc)))
    .on('mouseleave', () => { g.style('opacity', 1); link.style('opacity', 1).attr('stroke', css('--border-strong')); hideTip(); })
    .on('click', (e, d) => d.kind === 'incident' && jumpTo(d.id));
  sim.on('tick', () => {
    for (const d of data) { d.x = Math.max(16, Math.min(W - 90, d.x)); d.y = Math.max(16, Math.min(H - 16, d.y)); }
    link.attr('x1', (d) => d.source.x).attr('y1', (d) => d.source.y).attr('x2', (d) => d.target.x).attr('y2', (d) => d.target.y);
    g.attr('transform', (d) => `translate(${d.x},${d.y})`);
  });
}

// ---------- Incident cards ----------
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
  const comp = state.component && componentName(state.component);
  document.getElementById('list-count').innerHTML = `${list.length} of ${incidents.length} shown${comp
    ? ` · linked to <strong>${esc(comp)}</strong> <button class="chip" id="clear-comp" style="--c:var(--accent);padding:2px 10px">Clear ×</button>` : ''}`;
  document.getElementById('clear-comp')?.addEventListener('click', () => { state.component = null; render(); });
  document.getElementById('incident-list').innerHTML = list.length ? list.map((i) => `
    <article class="card" id="${esc(i.id)}" style="--c:${catColor(i.category[0])}">
      <div class="card-top">
        <span class="tag sev" style="--sc:var(--${i.severity})">${i.severity}</span>
        ${i.category.map((c) => `<span class="tag" style="color:${catColor(c)}">${catLabel(c)}</span>`).join('')}
        <span class="tag">${i.type}</span>
        ${i.status !== 'confirmed' ? `<span class="tag">${i.status}</span>` : ''}
      </div>
      <h3>${esc(i.title)}</h3>
      <div class="meta">${fmtDate(i)} · ${esc(place(i))}</div>
      <p>${esc(i.summary)}</p>
      ${renderCause(i)}
      <div class="sources">Sources: ${i.sources.map((s) => s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.publisher)}</a>` : esc(s.publisher)).join(', ')}${i.sources.every((s) => !s.url) ? ' · links pending' : ''}</div>
    </article>`).join('') : '<div class="empty">No incidents match these filters.</div>';
}

// Keep the sticky filter bar just under the header, whose height changes when the nav wraps.
const header = document.querySelector('.top'), controls = document.querySelector('.controls');
new ResizeObserver(() => { controls.style.top = `${header.offsetHeight}px`; }).observe(header);

// ---------- Reveal on scroll ----------
const io = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) {
    e.target.classList.add('in');
    io.unobserve(e.target);
    if (e.target.id === 'map') setTimeout(() => map.invalidateSize(), 300);
  }
}, { threshold: 0.08 });
document.querySelectorAll('.reveal').forEach((el) => io.observe(el));

function render() {
  const list = visible();
  renderStats(list);
  renderMap(list);
  renderBeeswarm(list);
  renderSankey(list);
  renderNetwork(list);
  renderList(list);
}
renderSupply();
render();
