const CATS = [
  { id: 'physical', label: 'Physical' },
  { id: 'it-ot', label: 'IT / OT / SCADA' },
  { id: 'supply-chain', label: 'Supply chain' },
  { id: 'energy', label: 'Energy' },
  { id: 'capacity', label: 'Capacity' },
  { id: 'market', label: 'Market' },
  { id: 'regulation', label: 'Regulation' },
];
const SECURITY = new Set(['physical', 'it-ot', 'supply-chain']);
const SEV = { low: 0, medium: 1, high: 2, critical: 3 };
const SEV_PX = { low: 12, medium: 15, high: 19, critical: 24 };
const DAY = 864e5;
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const catColor = (c) => css(`--${c}`);
const catLabel = (c) => CATS.find((x) => x.id === c)?.label ?? c;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
const ACRONYMS = { ups: 'UPS', bms: 'BMS' };
const pretty = (s) => ACRONYMS[s] ?? String(s).replace(/-/g, ' ');
const toDate = (s) => new Date(`${s}T00:00:00Z`);
const fmtDate = (i) => toDate(i.date).toLocaleDateString('en-US', i.date_precision === 'month'
  ? { year: 'numeric', month: 'short', timeZone: 'UTC' } : { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
const place = (i) => (i.location ? `${i.location.city}, ${i.location.country}` : 'Global');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const [incidents, supply, headlines, campuses, hubs] = await Promise.all(
  // Reuse the build version stamped on this script's URL so data isn't served stale after a deploy.
  ['incidents', 'supply-chain', 'headlines', 'campuses', 'hubs'].map((f) => fetch(`data/${f}.json${new URL(import.meta.url).search}`).then((r) => r.json())),
);
const byId = new Map(incidents.map((i) => [i.id, i]));
// focus = a cross-filter set by clicking a chart element: {kind, value, label}
const state = { cats: new Set(CATS.map((c) => c.id)), minSev: 'low', q: '', focus: null, until: Infinity };

const partiesOf = (i) => [...new Set([...(i.vendors ?? []), ...(i.operators ?? []),
  ...(i.root_cause?.components ?? []).map((c) => c.manufacturer).filter(Boolean)])];
const FOCUS_TEST = {
  system: (i, v) => i.affects.includes(v),
  impact: (i, v) => i.impacts.includes(v),
  category: (i, v) => i.category.includes(v),
  party: (i, v) => partiesOf(i).includes(v),
  component: (i, v) => supply.components.find((c) => c.id === v)?.related_incidents.includes(i.id),
  pair: (i, v) => { const [a, m] = v.split('|'); return i.affects.includes(a) && i.impacts.includes(m); },
};
const FOCUS_NOUN = { system: 'System hit', impact: 'Consequence', category: 'Threat type', party: 'Company', component: 'Supply chain', pair: 'System → consequence' };

// CVE IDs from an incident's text and its NVD links, and whether CISA's KEV catalog is cited.
// Other URLs are skipped: article slugs can mangle IDs (one source's slug has a typo'd CVE).
const CVE_RE = /CVE-\d{4}-\d{4,7}/gi;
const cvesOf = (i) => [...new Set([i.title, i.summary, i.root_cause?.summary, ...(i.root_cause?.components ?? []).map((c) => c.detail),
  ...i.sources.map((s) => s.publisher), ...i.sources.filter((s) => /nvd\.nist\.gov/.test(s.url ?? '')).map((s) => s.url)]
  .join(' ').match(CVE_RE)?.map((c) => c.toUpperCase()) ?? [])];
const kevCited = (i) => /\bKEV\b|known exploited/i.test([i.summary, ...i.sources.map((s) => `${s.publisher} ${s.url}`)].join(' '));

const matches = (i) =>
  i.category.some((c) => state.cats.has(c)) &&
  SEV[i.severity] >= SEV[state.minSev] &&
  (!state.focus || FOCUS_TEST[state.focus.kind](i, state.focus.value)) &&
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
const sevEl = document.getElementById('sev-filter'), searchEl = document.getElementById('search');
sevEl.addEventListener('change', (e) => { state.minSev = e.target.value; render(); });
let qTimer;
searchEl.addEventListener('input', (e) => {
  clearTimeout(qTimer);
  qTimer = setTimeout(() => { state.q = e.target.value.trim().toLowerCase(); render(); }, 150);
});
addEventListener('keydown', (e) => {
  if (e.key === '/' && !/input|select|textarea/i.test(document.activeElement.tagName)) { e.preventDefault(); searchEl.focus(); }
  if (e.key === 'Escape' && state.focus) setFocus(null);
});

function setFocus(kind, value, label) {
  state.focus = kind ? { kind, value, label: label ?? pretty(value) } : null;
  hideTip();
  render();
}
function resetAll() {
  state.cats = new Set(CATS.map((c) => c.id)); state.minSev = 'low'; state.q = ''; state.focus = null;
  filters.querySelectorAll('.chip').forEach((b) => b.setAttribute('aria-pressed', 'true'));
  sevEl.value = 'low'; searchEl.value = '';
  render();
}
function renderFocusBar(list) {
  const bar = document.getElementById('focus-bar');
  bar.hidden = !state.focus;
  if (!state.focus) return;
  bar.innerHTML = `<span class="k">${FOCUS_NOUN[state.focus.kind]}</span> <strong>${esc(state.focus.label)}</strong>
    <span class="muted">· ${list.length} incident${list.length === 1 ? '' : 's'}</span>
    <button class="chip copy-view" style="--c:var(--accent)">Copy link to this view</button>
    <button class="chip clear" style="--c:var(--accent)">Clear ×</button>`;
  bar.querySelector('.clear').onclick = () => setFocus(null);
  bar.querySelector('.copy-view').onclick = (e) => copyLink(location.href, e.currentTarget);
}

// ---------- Shareable URLs: filters live in the query string, an incident in the hash ----------
function writeUrl() {
  const p = new URLSearchParams();
  if (state.cats.size < CATS.length) p.set('cat', [...state.cats].join(','));
  if (state.minSev !== 'low') p.set('sev', state.minSev);
  if (state.q) p.set('q', state.q);
  if (state.focus) p.set('focus', `${state.focus.kind}:${state.focus.value}`);
  const qs = p.toString();
  const hash = byId.has(location.hash.slice(1)) ? location.hash : '';
  history.replaceState(null, '', `${location.pathname}${qs ? `?${qs}` : ''}${hash}`);
}
function readUrl() {
  const p = new URLSearchParams(location.search);
  const cats = p.get('cat')?.split(',').filter((c) => CATS.some((x) => x.id === c));
  if (cats?.length) {
    state.cats = new Set(cats);
    filters.querySelectorAll('.chip').forEach((b) => b.setAttribute('aria-pressed', String(state.cats.has(b.dataset.cat))));
  }
  if (SEV[p.get('sev')] !== undefined) { state.minSev = p.get('sev'); sevEl.value = state.minSev; }
  if (p.get('q')) { state.q = p.get('q').toLowerCase(); searchEl.value = p.get('q'); }
  const f = p.get('focus'), k = f?.slice(0, f.indexOf(':')), v = f?.slice(f.indexOf(':') + 1);
  if (k && FOCUS_TEST[k]) {
    const label = k === 'category' ? catLabel(v) : k === 'component' ? supply.components.find((c) => c.id === v)?.name
      : k === 'pair' ? v.split('|').map(pretty).join(' → ') : k === 'party' ? v : pretty(v);
    state.focus = { kind: k, value: v, label };
  }
}
async function copyLink(url, btn) {
  try { await navigator.clipboard.writeText(url); } catch { prompt('Copy this link:', url); return; }
  const old = btn.textContent; btn.textContent = 'Copied ✓';
  setTimeout(() => { btn.textContent = old; }, 1400);
}

// ---------- KPIs ----------
function renderStats(list) {
  const n = (c) => list.filter((i) => i.category.includes(c)).length;
  const countries = new Set(list.filter((i) => i.location).map((i) => i.location.country)).size;
  const cards = [
    ['Tracked events', list.length, `${list.filter((i) => i.category.some((c) => SECURITY.has(c))).length} security · ${list.filter((i) => i.category.some((c) => !SECURITY.has(c))).length} industry`, css('--accent')],
    ['Critical or high', list.filter((i) => SEV[i.severity] >= 2).length, 'Most severe incidents and most significant moves', css('--critical')],
    ['Countries hit', countries, 'Plus global advisories and policy', css('--party')],
    ['Root causes traced', list.filter((i) => i.root_cause && i.root_cause.confidence !== 'unknown').length, 'Failed part identified from sources', css('--ok')],
  ];
  const el = document.getElementById('stats');
  if (!el.children.length) {
    const hints = ['Reset all filters', 'Show only critical and high', 'Explore the globe', 'Read the root causes'];
    el.innerHTML = cards.map(([l, , s, c], k) => `<button class="kpi" data-k="${k}" title="${hints[k]}" style="--c:${c}"><div class="label">${l}</div><div class="value">0</div><div class="sub">${s}</div><span class="kpi-go">${hints[k]} →</span></button>`).join('');
    el.addEventListener('click', (e) => {
      const k = e.target.closest('.kpi')?.dataset.k;
      if (k === '0') resetAll();
      if (k === '1') { sevEl.value = 'high'; state.minSev = 'high'; render(); document.getElementById('map').scrollIntoView({ behavior: 'smooth' }); }
      if (k === '2') document.getElementById('map').scrollIntoView({ behavior: 'smooth' });
      if (k === '3') document.getElementById('incidents').scrollIntoView({ behavior: 'smooth' });
    });
  }
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
  renderGlobe(onMap);
  const off = list.filter((x) => !x.location).length;
  document.getElementById('unmapped').textContent = off ? `${off} advisory or policy entr${off === 1 ? 'y' : 'ies'} with no single location appear in the list below` : '';
  const through = Number.isFinite(state.until) ? new Date(state.until) : new Date(t1);
  document.getElementById('time-label').textContent =
    `${through.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} · ${onMap.length} on map`;
}

// ---------- 3D globe ----------
const TEX = 'https://cdn.jsdelivr.net/npm/three-globe@2.45.6/example/img/';
const rgba = (hex, a) => { const n = parseInt(hex.replace('#', ''), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
const hasWebGL = (() => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } })();
const globeEl = document.getElementById('globe'), leafletEl = document.getElementById('leaflet');
let globe = null, view = 'globe';

// Arcs join mapped incidents that share a vendor, operator or maker.
function sharedArcs(onMap) {
  const arcs = [];
  for (let a = 0; a < onMap.length; a++) for (let b = a + 1; b < onMap.length; b++) {
    const A = onMap[a], B = onMap[b];
    const shared = partiesOf(A).filter((p) => partiesOf(B).includes(p));
    if (shared.length) arcs.push({ A, B, shared });
  }
  return arcs;
}

function initGlobe() {
  if (globe) return true;
  if (typeof Globe === 'undefined' || !hasWebGL) return false;
  globe = Globe()(globeEl)
    .width(globeEl.clientWidth).height(globeEl.clientHeight)
    .backgroundColor('rgba(0,0,0,0)')
    .globeImageUrl(`${TEX}earth-night.jpg`).bumpImageUrl(`${TEX}earth-topology.png`)
    .showAtmosphere(true).atmosphereColor('#38b6ff').atmosphereAltitude(0.2)
    .pointLat((d) => d.location.lat).pointLng((d) => d.location.lon)
    .pointColor((d) => catColor(d.category[0]))
    .pointAltitude((d) => 0.03 + SEV[d.severity] * 0.06).pointRadius((d) => 0.35 + SEV[d.severity] * 0.15)
    .pointLabel((d) => `<div class="gtip">${incTip(d)}<em>Click for details</em></div>`)
    .onPointClick((d) => showDetail(d))
    .ringLat((d) => d.location.lat).ringLng((d) => d.location.lon)
    .ringColor((d) => (t) => rgba(catColor(d.category[0]), 1 - t))
    .ringMaxRadius((d) => 3 + SEV[d.severity] * 1.6).ringPropagationSpeed(2.2)
    .ringRepeatPeriod((d) => 1600 - SEV[d.severity] * 250)
    .arcStartLat((d) => d.A.location.lat).arcStartLng((d) => d.A.location.lon)
    .arcEndLat((d) => d.B.location.lat).arcEndLng((d) => d.B.location.lon)
    .arcColor((d) => [rgba(catColor(d.A.category[0]), 0.9), rgba(catColor(d.B.category[0]), 0.9)])
    .arcStroke(0.45).arcDashLength(0.45).arcDashGap(0.25).arcDashAnimateTime(reduceMotion ? 0 : 2600).arcAltitudeAutoScale(0.45)
    .arcLabel((d) => `<div class="gtip"><strong>Shared: ${esc(d.shared.join(', '))}</strong><span class="meta">${esc(d.A.title)}<br>↔ ${esc(d.B.title)}</span></div>`);
  globe.pointOfView({ lat: 30, lng: 40, altitude: 1.95 });
  const ctl = globe.controls();
  ctl.autoRotate = !reduceMotion; ctl.autoRotateSpeed = 0.45;
  ctl.enableZoom = false; // don't hijack page scrolling until the visitor clicks the globe
  globeEl.addEventListener('pointerdown', () => { ctl.autoRotate = false; ctl.enableZoom = true; });
  globeEl.addEventListener('pointerleave', () => { ctl.enableZoom = false; });
  new ResizeObserver(() => globe.width(globeEl.clientWidth).height(globeEl.clientHeight)).observe(globeEl);
  return true;
}

function renderGlobe(onMap) {
  if (!globe) return;
  globe.pointsData(onMap).ringsData(onMap).arcsData(sharedArcs(onMap));
}

function setView(v) {
  if (v === 'globe' && !initGlobe()) v = 'flat';
  view = v;
  globeEl.hidden = v !== 'globe';
  document.getElementById('globe-hint').hidden = v !== 'globe';
  leafletEl.hidden = v !== 'flat';
  document.getElementById('view-globe').setAttribute('aria-pressed', String(v === 'globe'));
  document.getElementById('view-flat').setAttribute('aria-pressed', String(v === 'flat'));
  if (v === 'flat') setTimeout(() => map.invalidateSize(), 0);
  renderMap(visible());
}
document.getElementById('view-globe').onclick = () => setView('globe');
document.getElementById('view-flat').onclick = () => setView('flat');

function locate(i) {
  document.getElementById('map').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
  showDetail(i);
}

const detail = document.getElementById('map-detail');
function showDetail(i) {
  if (i.location) {
    if (view === 'globe' && globe) { globe.controls().autoRotate = false; globe.pointOfView({ lat: i.location.lat, lng: i.location.lon, altitude: 1.3 }, 1400); }
    else map.flyTo([i.location.lat, i.location.lon], 4, { duration: 1.2 });
  }
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
  setFocus('component', a.dataset.component, componentName(a.dataset.component));
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
  const KIND = { c: 'category', a: 'system', i: 'impact' };
  node.on('mouseenter', (e, d) => link.attr('stroke-opacity', (l) => connected(d, l) ? 0.75 : 0.06))
    .on('mousemove', (e, d) => showTip(e, `<strong>${esc(d.id.startsWith('c:') ? catLabel(d.id.slice(2)) : pretty(d.id.slice(2)))}</strong>Click to filter the whole page`))
    .on('mouseleave', () => { link.attr('stroke-opacity', 0.4); hideTip(); })
    .on('click', (e, d) => {
      const [k, v] = [d.id[0], d.id.slice(2)];
      setFocus(KIND[k], v, k === 'c' ? catLabel(v) : pretty(v));
    });
  // Keep the focused node lit so the filter is visible here too.
  if (state.focus) node.selectAll('rect').attr('opacity', (d) => {
    const k = { category: 'c', system: 'a', impact: 'i' }[state.focus.kind];
    return !k || d.id === `${k}:${state.focus.value}` ? 1 : 0.35;
  });
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
    .on('click', (e, d) => {
      if (d.kind === 'incident') return jumpTo(d.id);
      setFocus(d.kind === 'system' ? 'system' : 'party', d.kind === 'system' ? d.id.slice(2) : d.label, d.label);
    });
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

// ---------- Analyst views ----------
// Risk matrix: which systems were hit, and what that led to.
function renderMatrix(list) {
  const systems = [...new Set(list.flatMap((i) => i.affects))];
  const impacts = [...new Set(list.flatMap((i) => i.impacts))];
  const cell = (a, m) => list.filter((i) => i.affects.includes(a) && i.impacts.includes(m));
  const rowTotal = (a) => list.filter((i) => i.affects.includes(a)).length;
  systems.sort((a, b) => rowTotal(b) - rowTotal(a));
  impacts.sort((a, b) => list.filter((i) => i.impacts.includes(b)).length - list.filter((i) => i.impacts.includes(a)).length);
  const max = Math.max(1, ...systems.flatMap((a) => impacts.map((m) => cell(a, m).length)));
  const el = document.getElementById('matrix');
  if (!systems.length) { el.innerHTML = '<div class="empty">No incidents match these filters.</div>'; return; }
  el.style.gridTemplateColumns = `minmax(90px, auto) repeat(${impacts.length}, minmax(44px, 1fr))`;
  el.innerHTML = `<span></span>${impacts.map((m) => `<span class="mx-col">${esc(pretty(m))}</span>`).join('')}${
    systems.map((a) => `<span class="mx-row">${esc(pretty(a))}</span>${impacts.map((m) => {
      const hits = cell(a, m), n = hits.length;
      const worst = hits.reduce((w, i) => Math.max(w, SEV[i.severity]), -1);
      const on = state.focus?.kind === 'pair' && state.focus.value === `${a}|${m}`;
      return `<button class="mx-cell${on ? ' on' : ''}" ${n ? '' : 'disabled'} data-pair="${a}|${m}"
        style="--a:${n ? 0.15 + 0.85 * (n / max) : 0}" title="${esc(pretty(a))} → ${esc(pretty(m))}: ${n} incident${n === 1 ? '' : 's'}${n ? `, worst ${Object.keys(SEV)[worst]}` : ''}">${n || ''}</button>`;
    }).join('')}`).join('')}`;
}
document.getElementById('matrix').addEventListener('click', (e) => {
  const b = e.target.closest('[data-pair]');
  if (!b) return;
  const [a, m] = b.dataset.pair.split('|');
  setFocus('pair', b.dataset.pair, `${pretty(a)} → ${pretty(m)}`);
});

// Companies that keep showing up, weighted by severity.
function renderLeaders(list) {
  const role = (p) => {
    const r = [];
    if (list.some((i) => (i.operators ?? []).includes(p))) r.push('operator');
    if (list.some((i) => (i.vendors ?? []).includes(p) || (i.root_cause?.components ?? []).some((c) => c.manufacturer === p))) r.push('vendor or maker');
    return r.join(' · ');
  };
  const rows = [...new Set(list.flatMap(partiesOf))].map((p) => {
    const hits = list.filter((i) => partiesOf(i).includes(p));
    return { p, n: hits.length, score: hits.reduce((s, i) => s + SEV[i.severity] + 1, 0), crit: hits.filter((i) => SEV[i.severity] >= 2).length };
  }).sort((a, b) => b.score - a.score || a.p.localeCompare(b.p)).slice(0, 10);
  const max = Math.max(1, ...rows.map((r) => r.score));
  document.getElementById('leaders').innerHTML = rows.length ? rows.map((r, k) => `
    <li><button data-party="${esc(r.p)}">
      <span class="rank">${k + 1}</span>
      <span class="who"><strong>${esc(r.p)}</strong><span class="muted">${role(r.p)}</span></span>
      <span class="lbar"><i style="width:${(100 * r.score) / max}%"></i></span>
      <span class="num">${r.n} incident${r.n === 1 ? '' : 's'}${r.crit ? ` · ${r.crit} high+` : ''}</span>
    </button></li>`).join('') : '<li class="empty">No companies in this view.</li>';
}
document.getElementById('leaders').addEventListener('click', (e) => {
  const b = e.target.closest('[data-party]');
  if (b) setFocus('party', b.dataset.party, b.dataset.party);
});

// How much is actually known: evidence quality for the current view.
function renderEvidence(list) {
  const conf = ['confirmed', 'likely', 'suspected', 'unknown'];
  const counts = conf.map((c) => list.filter((i) => (i.root_cause?.confidence ?? 'unknown') === c).length);
  const origins = list.flatMap((i) => (i.root_cause?.components ?? []).filter((c) => c.role === 'origin'));
  const named = origins.filter((c) => c.manufacturer).length, guessed = origins.filter((c) => !c.manufacturer && c.inferred).length;
  const factors = list.reduce((s, i) => s + (i.supply_chain_factors?.length ?? 0), 0);
  const linked = list.filter((i) => i.sources.some((s) => s.url)).length;
  const total = Math.max(1, list.length);
  document.getElementById('evidence').innerHTML = `
    <div class="ev-label">Root cause confidence</div>
    <div class="stack">${conf.map((c, k) => counts[k] ? `<span class="seg-${c}" style="flex:${counts[k]}" title="${c}: ${counts[k]}">${counts[k]}</span>` : '').join('')}</div>
    <div class="legend">${conf.map((c, k) => `<span><i class="seg-${c}"></i>${c} ${counts[k]}</span>`).join('')}</div>
    <div class="ev-grid">
      <div><b>${named}<small>/${origins.length}</small></b>failed parts with a published maker</div>
      <div><b>${guessed}</b>evidence-backed best guesses</div>
      <div><b>${factors}</b>supply chain factors documented</div>
      <div><b>${Math.round((100 * linked) / total)}%</b>incidents with linked sources</div>
    </div>
    <p class="muted small">Makers are only shown when a source names them. Most operators never publish the make of a failed part.</p>`;
}

// ---------- Exports ----------
const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
function download(name, type, text) {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([text], { type })), download: name });
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function exportCsv() {
  const cols = ['id', 'date', 'title', 'type', 'category', 'severity', 'status', 'location', 'affects', 'impacts',
    'operators', 'vendors', 'cves', 'root_cause', 'root_cause_confidence', 'failed_parts', 'supply_chain_factors', 'sources'];
  const rows = visible().map((i) => [i.id, i.date, i.title, i.type, i.category.join('; '), i.severity, i.status, place(i),
    i.affects.join('; '), i.impacts.join('; '), (i.operators ?? []).join('; '), (i.vendors ?? []).join('; '), cvesOf(i).join('; '),
    i.root_cause?.summary, i.root_cause?.confidence,
    (i.root_cause?.components ?? []).map((c) => [c.part, c.manufacturer, c.model].filter(Boolean).join(' / ')).join('; '),
    (i.supply_chain_factors ?? []).map((f) => f.factor).join('; '), i.sources.map((s) => s.url ?? s.publisher).join(' ')]);
  download('dc-security-incidents.csv', 'text/csv', [cols, ...rows].map((r) => r.map(csvCell).join(',')).join('\n'));
}
document.getElementById('export-csv').onclick = exportCsv;
document.getElementById('export-json').onclick = () =>
  download('dc-security-incidents.json', 'application/json', JSON.stringify(visible(), null, 2));
document.getElementById('print-brief').onclick = () => window.print();
// The printed briefing expands every root cause and states the filters used.
addEventListener('beforeprint', () => {
  document.querySelectorAll('.card details').forEach((d) => { d.dataset.wasOpen = d.open; d.open = true; });
  const f = [state.cats.size < CATS.length && [...state.cats].map(catLabel).join(', '), state.minSev !== 'low' && `${state.minSev} and up`,
    state.q && `"${state.q}"`, state.focus && `${FOCUS_NOUN[state.focus.kind]}: ${state.focus.label}`].filter(Boolean);
  document.getElementById('print-head').innerHTML = `<h1>Data center security briefing</h1>
    <p>${new Date().toLocaleDateString('en-US', { dateStyle: 'long' })} · ${visible().length} incidents · ${f.length ? `Filters: ${esc(f.join(' · '))}` : 'All incidents'}</p>
    <p>Source: ${esc(location.href)}</p>`;
});
addEventListener('afterprint', () => document.querySelectorAll('.card details').forEach((d) => { d.open = d.dataset.wasOpen === 'true'; }));

function renderList(list) {
  document.getElementById('list-count').textContent = `${list.length} of ${incidents.length} shown`;
  document.getElementById('incident-list').innerHTML = list.length ? list.map((i) => `
    <article class="card" id="${esc(i.id)}" style="--c:${catColor(i.category[0])}">
      <div class="card-top">
        <span class="tag sev" style="--sc:var(--${i.severity})">${i.severity}</span>
        ${i.category.map((c) => `<span class="tag" style="color:${catColor(c)}">${catLabel(c)}</span>`).join('')}
        <span class="tag">${i.type}</span>
        ${i.status !== 'confirmed' ? `<span class="tag">${i.status}</span>` : ''}
        ${kevCited(i) ? '<span class="tag kev" title="Listed in CISA\'s Known Exploited Vulnerabilities catalog">KEV · exploited</span>' : ''}
        <span class="card-actions">
          ${i.location ? `<button class="locate" data-locate="${esc(i.id)}" title="Show on the map">◎ Locate</button>` : ''}
          <button class="locate" data-copy="${esc(i.id)}" title="Copy a link to this incident">🔗 Link</button>
        </span>
      </div>
      <h3>${esc(i.title)}</h3>
      <div class="meta">${fmtDate(i)} · ${esc(place(i))}</div>
      <div class="card-links">${partiesOf(i).map((p) => `<button class="pill" data-party="${esc(p)}">${esc(p)}</button>`).join('')}${
        cvesOf(i).map((c) => `<a class="pill cve" href="https://nvd.nist.gov/vuln/detail/${c}" target="_blank" rel="noopener" title="Open in NVD">${c}</a>`).join('')}</div>
      <p>${esc(i.summary)}</p>
      ${renderCause(i)}
      <div class="sources">Sources: ${i.sources.map((s) => s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.publisher)}</a>` : esc(s.publisher)).join(', ')}${i.sources.every((s) => !s.url) ? ' · links pending' : ''}</div>
    </article>`).join('') : '<div class="empty">No incidents match these filters.</div>';
}

// Card interactions: locate on the map, filter by company, and a glow that follows the cursor.
const listEl = document.getElementById('incident-list');
listEl.addEventListener('click', (e) => {
  const loc = e.target.closest('[data-locate]');
  if (loc) return locate(byId.get(loc.dataset.locate));
  const cp = e.target.closest('[data-copy]');
  if (cp) return copyLink(`${location.origin}${location.pathname}#${cp.dataset.copy}`, cp);
  const party = e.target.closest('[data-party]');
  if (party) setFocus('party', party.dataset.party, party.dataset.party);
});
listEl.addEventListener('pointermove', (e) => {
  const card = e.target.closest('.card');
  if (!card) return;
  const r = card.getBoundingClientRect();
  card.style.setProperty('--mx', `${e.clientX - r.left}px`);
  card.style.setProperty('--my', `${e.clientY - r.top}px`);
});

// Keep the sticky filter bar just under the header, whose height changes when the nav wraps.
const header = document.querySelector('.top'), controls = document.querySelector('.controls');
new ResizeObserver(() => { controls.style.top = `${header.offsetHeight}px`; }).observe(header);

// ---------- Opportunity radar ----------
const STAGES = ['announced', 'permitting', 'under-construction', 'operational', 'paused', 'cancelled'];
const ACTIVE = new Set(['announced', 'permitting', 'under-construction']);
const STAGE_COLOR = { announced: 'var(--accent)', permitting: 'var(--medium)', 'under-construction': 'var(--capacity)', operational: 'var(--ok)', paused: 'var(--system)', cancelled: 'var(--critical)' };
const REGIONS = {
  'North America': ['US', 'CA'], 'Latin America': ['MX', 'BR', 'CL', 'CO', 'AR', 'PE'],
  Europe: ['GB', 'IE', 'NL', 'DE', 'FR', 'ES', 'IT', 'SE', 'NO', 'FI', 'DK', 'PL', 'PT', 'BE', 'CH', 'AT', 'IS'],
  'Middle East and Africa': ['SA', 'AE', 'QA', 'IL', 'ZA', 'NG', 'KE', 'EG', 'MA'],
  'Asia-Pacific': ['SG', 'MY', 'ID', 'IN', 'JP', 'KR', 'AU', 'NZ', 'HK', 'TW', 'TH', 'VN', 'PH', 'CN'],
};
const regionOf = (cc) => Object.keys(REGIONS).find((r) => REGIONS[r].includes(cc)) ?? 'Other';
const fmtMw = (mw) => (mw == null ? '—' : mw >= 1000 ? `${(mw / 1000).toFixed(mw % 1000 ? 1 : 0)} GW` : `${Math.round(mw)} MW`);
const campusPlace = (c) => [c.location?.city, c.location?.region, c.location?.country].filter(Boolean).join(', ');
const radarEl = { stage: document.getElementById('radar-stage'), region: document.getElementById('radar-region'),
  mw: document.getElementById('radar-mw'), liquid: document.getElementById('radar-liquid') };
radarEl.region.innerHTML += [...new Set(campuses.map((c) => regionOf(c.location?.country)))].sort()
  .map((r) => `<option>${esc(r)}</option>`).join('');

const radarList = () => campuses.filter((c) =>
  (radarEl.stage.value === 'all' || (radarEl.stage.value === 'active' ? ACTIVE.has(c.stage) : c.stage === radarEl.stage.value)) &&
  (radarEl.region.value === 'all' || regionOf(c.location?.country) === radarEl.region.value) &&
  (c.capacity_mw ?? 0) >= +radarEl.mw.value &&
  (!radarEl.liquid.checked || c.cooling?.liquid === true))
  .sort((a, b) => (b.capacity_mw ?? 0) - (a.capacity_mw ?? 0));

function renderRadar() {
  const list = radarList();
  const total = (xs) => xs.reduce((s, c) => s + (c.capacity_mw ?? 0), 0);
  document.getElementById('radar-count').textContent = campuses.length
    ? `${list.length} of ${campuses.length} campuses · ${fmtMw(total(list))} in view` : '';
  const byStage = STAGES.map((st) => [st, total(campuses.filter((c) => c.stage === st))]).filter(([, mw]) => mw > 0);
  const all = Math.max(1, byStage.reduce((s, [, mw]) => s + mw, 0));
  const liquid = campuses.filter((c) => c.cooling?.liquid === true);
  document.getElementById('radar-summary').innerHTML = campuses.length ? `
    <div class="ev-label">Tracked capacity by stage</div>
    <div class="stack">${byStage.map(([st, mw]) => `<span style="flex:${mw};background:${STAGE_COLOR[st]}" title="${pretty(st)}: ${fmtMw(mw)}">${mw / all > 0.08 ? fmtMw(mw) : ''}</span>`).join('')}</div>
    <div class="legend">${byStage.map(([st, mw]) => `<span><i style="background:${STAGE_COLOR[st]}"></i>${pretty(st)} ${fmtMw(mw)}</span>`).join('')}</div>
    <div class="ev-grid">
      <div><b>${fmtMw(total(campuses.filter((c) => ACTIVE.has(c.stage))))}</b>in the active pipeline</div>
      <div><b>${campuses.filter((c) => c.stage === 'under-construction').length}</b>campuses under construction</div>
      <div><b>${liquid.length}<small>/${campuses.length}</small></b>with liquid cooling confirmed</div>
      <div><b>${new Set(campuses.map((c) => c.location?.country)).size}</b>countries</div>
    </div>` : '<div class="empty">Campus data is being researched and will appear here.</div>';
  const table = document.getElementById('radar-table');
  table.innerHTML = list.length ? `<thead><tr><th>Campus</th><th>Operator and tenants</th><th>Location</th><th class="num">Capacity</th><th>Stage</th><th>Online</th><th>Cooling</th><th></th></tr></thead>
    <tbody>${list.map((c) => `<tr>
      <td><strong>${esc(c.name)}</strong></td>
      <td><button class="linkish" data-brief="${esc(c.operator)}">${esc(c.operator)}</button>${(c.tenants ?? []).length ? `<div class="muted small">${(c.tenants).map((t) => `<button class="linkish" data-brief="${esc(t)}">${esc(t)}</button>`).join(', ')}</div>` : ''}</td>
      <td>${esc(campusPlace(c))}</td>
      <td class="num">${fmtMw(c.capacity_mw)}${c.capacity_basis ? `<div class="muted small">${esc(c.capacity_basis)}</div>` : ''}</td>
      <td><span class="stage" style="--sc:${STAGE_COLOR[c.stage]}">${pretty(c.stage)}</span></td>
      <td class="mono">${esc(c.expected_online ?? '—')}</td>
      <td>${c.cooling?.liquid === true ? '<span class="tag conf-confirmed">liquid</span>' : c.cooling?.liquid === false ? '<span class="tag">air</span>' : '<span class="muted">unknown</span>'}
        ${(c.cooling?.vendors ?? []).length ? `<div class="muted small">${esc(c.cooling.vendors.join(', '))}</div>` : ''}${c.cooling?.notes ? `<div class="muted small">${esc(c.cooling.notes)}</div>` : ''}</td>
      <td class="nowrap">${c.location ? `<button class="locate" data-campus="${esc(c.id)}">◎ Map</button>` : ''} ${c.sources.filter((x) => x.url).slice(0, 2).map((x, k) => `<a href="${esc(x.url)}" target="_blank" rel="noopener" title="${esc(x.publisher)}">[${k + 1}]</a>`).join(' ')}</td>
    </tr>`).join('')}</tbody>` : campuses.length ? '<tbody><tr><td class="muted">No campuses match these filters.</td></tr></tbody>' : '';
}
Object.values(radarEl).forEach((el) => el.addEventListener('change', renderRadar));

// Campuses as an optional layer on the flat map.
const campusLayer = L.layerGroup();
for (const c of campuses.filter((x) => x.location)) {
  const s = Math.max(12, Math.min(30, 8 + Math.sqrt(c.capacity_mw ?? 50)));
  L.marker([c.location.lat, c.location.lon], {
    title: c.name,
    icon: L.divIcon({ className: '', iconSize: [s, s], html: `<div class="campus-pin" style="--sc:${STAGE_COLOR[c.stage]};width:${s}px;height:${s}px"></div>` }),
  }).bindPopup(`<strong>${esc(c.name)}</strong><br>${esc(c.operator)} · ${fmtMw(c.capacity_mw)} · ${pretty(c.stage)}<br>${esc(campusPlace(c))}`).addTo(campusLayer);
}
const showCampuses = document.getElementById('show-campuses');
showCampuses.addEventListener('change', () => { showCampuses.checked ? campusLayer.addTo(map) : map.removeLayer(campusLayer); });
document.getElementById('radar-table').addEventListener('click', (e) => {
  const pin = e.target.closest('[data-campus]');
  if (pin) {
    const c = campuses.find((x) => x.id === pin.dataset.campus);
    if (view !== 'flat') setView('flat');
    showCampuses.checked = true; campusLayer.addTo(map);
    document.getElementById('map').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
    map.flyTo([c.location.lat, c.location.lon], 6, { duration: 1.2 });
  }
});

// ---------- Heat and water watch ----------
const toRad = (d) => (d * Math.PI) / 180;
const kmBetween = (a, b) => {
  const h = Math.sin(toRad(b.lat - a.lat) / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(toRad(b.lon - a.lon) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};
const WATER_RANK = { low: 0, 'low-medium': 1, 'medium-high': 2, high: 3, 'extremely high': 4, 'arid and low water use': 3 };
let forecasts = null; // hub id -> { peak, day }
async function loadForecasts() {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${hubs.map((h) => h.lat).join(',')}&longitude=${hubs.map((h) => h.lon).join(',')}&daily=temperature_2m_max&forecast_days=7&timezone=auto`;
  try {
    const res = await (await fetch(url)).json();
    const rows = Array.isArray(res) ? res : [res];
    forecasts = new Map(hubs.map((h, k) => {
      const d = rows[k]?.daily;
      if (!d) return [h.id, null];
      const i = d.temperature_2m_max.indexOf(Math.max(...d.temperature_2m_max));
      return [h.id, { peak: d.temperature_2m_max[i], day: d.time[i] }];
    }));
  } catch { forecasts = new Map(); }
  renderHeatWater();
}
function renderHeatWater() {
  const near = (h, xs, loc) => xs.filter((x) => loc(x) && kmBetween(h, loc(x)) <= 300);
  const rows = hubs.map((h) => {
    const f = forecasts?.get(h.id);
    const coolingHits = near(h, incidents.filter((i) => i.affects.includes('cooling')), (i) => i.location);
    const pipeline = near(h, campuses.filter((c) => ACTIVE.has(c.stage)), (c) => c.location);
    const mw = pipeline.reduce((s, c) => s + (c.capacity_mw ?? 0), 0);
    const heat = f ? Math.max(0, f.peak - 27) : 0;
    const score = heat * 2 + (WATER_RANK[h.water_stress] ?? 0) * 2 + coolingHits.length * 3 + Math.min(10, mw / 300);
    return { h, f, coolingHits, pipeline, mw, score };
  }).sort((a, b) => b.score - a.score);
  const heatTag = (f) => !f ? '<span class="muted">—</span>'
    : `<span class="temp ${f.peak >= 35 ? 'hot2' : f.peak >= 30 ? 'hot1' : ''}">${Math.round(f.peak)}°C <small>${Math.round(f.peak * 9 / 5 + 32)}°F</small></span>
       <div class="muted small">${new Date(`${f.day}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}${f.peak >= 35 ? ' · heat alert' : ''}</div>`;
  document.getElementById('hw-table').innerHTML = `<thead><tr><th>Hub</th><th>7-day peak</th><th>Water stress</th><th class="num">Cooling incidents nearby</th><th class="num">Active pipeline nearby</th><th>Watch level</th></tr></thead>
    <tbody>${rows.map((r) => {
      const level = r.score >= 14 ? ['high', 'var(--critical)'] : r.score >= 7 ? ['elevated', 'var(--medium)'] : ['normal', 'var(--ok)'];
      return `<tr>
        <td><strong>${esc(r.h.name)}</strong><div class="muted small">${esc(r.h.country)}</div></td>
        <td>${heatTag(r.f)}</td>
        <td>${r.h.water_stress ? `<span class="water w${WATER_RANK[r.h.water_stress]}">${esc(r.h.water_stress)}</span>${r.h.water_note ? `<div class="muted small">${r.h.water_note_url ? `<a href="${esc(r.h.water_note_url)}" target="_blank" rel="noopener">${esc(r.h.water_note)}</a>` : esc(r.h.water_note)}</div>` : ''}` : '<span class="muted">not yet sourced</span>'}</td>
        <td class="num">${r.coolingHits.length ? r.coolingHits.map((i) => `<button class="linkish" data-jump="${esc(i.id)}" title="${esc(i.title)}">${fmtDate(i).slice(-4)}</button>`).join(' ') : '<span class="muted">0</span>'}</td>
        <td class="num">${r.mw ? `${fmtMw(r.mw)}<div class="muted small">${r.pipeline.length} campus${r.pipeline.length === 1 ? '' : 'es'}</div>` : '<span class="muted">—</span>'}</td>
        <td><span class="stage" style="--sc:${level[1]}">${level[0]}</span></td>
      </tr>`;
    }).join('')}</tbody>`;
}
document.getElementById('hw-table').addEventListener('click', (e) => {
  const j = e.target.closest('[data-jump]');
  if (j) jumpTo(j.dataset.jump);
});
loadForecasts(); // one small request for all hubs

// ---------- Cooling vendor tracker ----------
const COOLING_VENDORS = [
  ['Vertiv', 'NYSE:VRT'], ['Schneider Electric', 'EURONEXT:SU'], ['Johnson Controls', 'NYSE:JCI'], ['Trane Technologies', 'NYSE:TT'],
  ['Carrier', 'NYSE:CARR'], ['Modine', 'NYSE:MOD'], ['nVent', 'NYSE:NVT'], ['Daikin', 'TSE:6367'], ['Munters', 'OMXSTO:MTRS'],
  ['LiquidStack', null], ['CoolIT Systems', null], ['Motivair', null], ['Boyd', null], ['Stulz', null],
];
const nameMatch = (list, name) => list.some((x) => x && (x === name || x.toLowerCase().startsWith(name.toLowerCase())));
const eventsFor = (name) => incidents.filter((i) => nameMatch(partiesOf(i), name)).sort((a, b) => b.date.localeCompare(a.date));
const campusesFor = (name) => campuses.filter((c) => nameMatch([c.operator, ...(c.tenants ?? []), ...(c.cooling?.vendors ?? [])], name));
function renderVendors() {
  document.getElementById('vendor-grid').innerHTML = COOLING_VENDORS.map(([name, sym]) => {
    const ev = eventsFor(name), sites = campusesFor(name);
    const latest = ev[0];
    return `<button class="vendor" data-brief="${esc(name)}">
      <span class="v-top"><strong>${esc(name)}</strong><span class="mono muted">${sym ? esc(sym.split(':')[1]) : 'private'}</span></span>
      <span class="v-stats"><b>${ev.length}</b> tracked event${ev.length === 1 ? '' : 's'}${sites.length ? ` · <b>${sites.length}</b> named site${sites.length === 1 ? '' : 's'}` : ''}</span>
      <span class="v-latest muted">${latest ? `${fmtDate(latest)} · ${esc(latest.title)}` : 'No tracked events yet'}</span>
    </button>`;
  }).join('');
}

// ---------- Operator briefs ----------
const TICKERS = {
  Microsoft: 'NASDAQ:MSFT', 'Microsoft Azure': 'NASDAQ:MSFT', Google: 'NASDAQ:GOOGL', 'Google Cloud': 'NASDAQ:GOOGL', Alphabet: 'NASDAQ:GOOGL',
  Amazon: 'NASDAQ:AMZN', AWS: 'NASDAQ:AMZN', 'Amazon Web Services': 'NASDAQ:AMZN', Meta: 'NASDAQ:META', Oracle: 'NYSE:ORCL', 'Oracle Cloud': 'NYSE:ORCL',
  CoreWeave: 'NASDAQ:CRWV', Nebius: 'NASDAQ:NBIS', Equinix: 'NASDAQ:EQIX', 'Digital Realty': 'NYSE:DLR', 'Iron Mountain': 'NYSE:IRM',
  'Applied Digital': 'NASDAQ:APLD', 'Alibaba Cloud': 'NYSE:BABA', NVIDIA: 'NASDAQ:NVDA', Nvidia: 'NASDAQ:NVDA', AMD: 'NASDAQ:AMD',
  'AT&T': 'NYSE:T', OVHcloud: 'EURONEXT:OVH', Kakao: 'KRX:035720', 'HPE': 'NYSE:HPE', 'Supermicro': 'NASDAQ:SMCI', 'Dell': 'NYSE:DELL',
  Constellation: 'NASDAQ:CEG', Vistra: 'NYSE:VST', 'GE Vernova': 'NYSE:GEV', Eaton: 'NYSE:ETN',
  ...Object.fromEntries(COOLING_VENDORS.filter(([, s]) => s)),
};
const allNames = [...new Set([...incidents.flatMap(partiesOf), ...campuses.flatMap((c) => [c.operator, ...(c.tenants ?? []), ...(c.cooling?.vendors ?? [])]),
  ...COOLING_VENDORS.map(([n]) => n)].filter(Boolean))].sort((a, b) => a.localeCompare(b));
document.getElementById('brief-names').innerHTML = allNames.map((n) => `<option value="${esc(n)}">`).join('');
const popular = allNames.map((n) => [n, eventsFor(n).length + campusesFor(n).length]).sort((a, b) => b[1] - a[1]).slice(0, 12);
document.getElementById('brief-quick').innerHTML = popular.map(([n, k]) => `<button class="pill" data-brief="${esc(n)}">${esc(n)} <span class="muted">${k}</span></button>`).join('');

function keyPoints(name, ev, sites) {
  const pts = [];
  const cooling = ev.filter((i) => i.affects.includes('cooling'));
  const security = ev.filter((i) => i.category.some((c) => SECURITY.has(c)));
  const active = sites.filter((c) => ACTIVE.has(c.stage));
  if (active.length) pts.push(`${fmtMw(active.reduce((s, c) => s + (c.capacity_mw ?? 0), 0))} across ${active.length} campus${active.length === 1 ? '' : 'es'} in the active pipeline${active.some((c) => c.stage === 'under-construction') ? `, ${active.filter((c) => c.stage === 'under-construction').length} under construction` : ''}.`);
  const liquid = sites.filter((c) => c.cooling?.liquid === true);
  if (liquid.length) pts.push(`Liquid cooling confirmed at ${liquid.map((c) => c.name).join(', ')}.`);
  if (cooling.length) pts.push(`${cooling.length} tracked cooling-related incident${cooling.length === 1 ? '' : 's'}: ${cooling.map((i) => `${i.title} (${fmtDate(i)})`).join('; ')}.`);
  if (security.length && security.length !== cooling.length) pts.push(`${security.length} security incident${security.length === 1 ? '' : 's'} tracked in total, ${security.filter((i) => SEV[i.severity] >= 2).length} rated high or critical.`);
  const factors = [...new Set(ev.flatMap((i) => (i.supply_chain_factors ?? []).map((f) => componentName(f.component))))].filter(Boolean);
  if (factors.length) pts.push(`Supply chain exposure cited in its incidents: ${factors.join(', ')}.`);
  const dev = ev.filter((i) => i.type === 'development');
  if (dev.length) pts.push(`Latest industry move: ${dev[0].title} (${fmtDate(dev[0])}).`);
  if (!pts.length) pts.push('Nothing tracked yet beyond the entries below.');
  return pts;
}

const briefDlg = document.getElementById('brief');
function openBrief(name) {
  const ev = eventsFor(name), sites = campusesFor(name);
  const sym = TICKERS[name] ?? Object.entries(TICKERS).find(([k]) => name.toLowerCase().startsWith(k.toLowerCase()))?.[1];
  document.getElementById('brief-body').innerHTML = `
    <p class="eyebrow">Operator brief</p>
    <h2 id="brief-title">${esc(name)}</h2>
    <div class="ev-grid">
      <div><b>${ev.filter((i) => i.category.some((c) => SECURITY.has(c))).length}</b>security events</div>
      <div><b>${ev.filter((i) => !i.category.every((c) => SECURITY.has(c))).length}</b>industry developments</div>
      <div><b>${sites.length}</b>campuses tracked</div>
      <div><b>${fmtMw(sites.filter((c) => ACTIVE.has(c.stage)).reduce((s, c) => s + (c.capacity_mw ?? 0), 0))}</b>active pipeline</div>
    </div>
    ${sym ? `<div class="tradingview-widget-container brief-quote" id="brief-quote"></div>` : ''}
    <h3>Key points</h3>
    <ul class="key-points">${keyPoints(name, ev, sites).map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
    ${sites.length ? `<h3>Campuses</h3><ul class="brief-list">${sites.map((c) => `<li><strong>${esc(c.name)}</strong> · ${fmtMw(c.capacity_mw)} · ${pretty(c.stage)} · ${esc(campusPlace(c))}${c.cooling?.liquid === true ? ' · <span class="tag conf-confirmed">liquid</span>' : ''}</li>`).join('')}</ul>` : ''}
    ${ev.length ? `<h3>Events</h3><ul class="brief-list">${ev.map((i) => `<li><button class="linkish" data-jump="${esc(i.id)}">${esc(i.title)}</button> <span class="meta">${fmtDate(i)} · ${i.severity}</span></li>`).join('')}</ul>` : ''}
    <div class="brief-actions">
      <button class="chip" data-filter="${esc(name)}" style="--c:var(--accent)">Filter the page to ${esc(name)}</button>
      <button class="chip" data-print style="--c:var(--accent)">🖨 Print this brief</button>
    </div>`;
  if (sym) {
    const s = document.createElement('script');
    s.src = 'https://s3.tradingview.com/external-embedding/embed-widget-symbol-info.js';
    s.async = true;
    s.textContent = JSON.stringify({ symbol: sym, width: '100%', locale: 'en', colorTheme: 'dark', isTransparent: true });
    document.getElementById('brief-quote').append(Object.assign(document.createElement('div'), { className: 'tradingview-widget-container__widget' }), s);
  }
  if (!briefDlg.open) briefDlg.showModal();
}
document.getElementById('brief-close').onclick = () => briefDlg.close();
briefDlg.addEventListener('click', (e) => {
  if (e.target === briefDlg) return briefDlg.close(); // backdrop click
  const j = e.target.closest('[data-jump]');
  if (j) { briefDlg.close(); jumpTo(j.dataset.jump); }
  const f = e.target.closest('[data-filter]');
  if (f) { briefDlg.close(); setFocus('party', f.dataset.filter, f.dataset.filter); document.getElementById('map').scrollIntoView({ behavior: 'smooth' }); }
  if (e.target.closest('[data-print]')) { document.body.classList.add('print-brief'); window.print(); }
});
addEventListener('afterprint', () => document.body.classList.remove('print-brief'));
// Any element with data-brief opens that company's brief.
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-brief]');
  if (b) { e.preventDefault(); openBrief(b.dataset.brief); }
});
const briefSearch = document.getElementById('brief-search');
const openTyped = () => { const v = briefSearch.value.trim(); if (v) openBrief(allNames.find((n) => n.toLowerCase() === v.toLowerCase()) ?? v); };
document.getElementById('brief-open').onclick = openTyped;
briefSearch.addEventListener('keydown', (e) => { if (e.key === 'Enter') openTyped(); });

renderRadar();
renderVendors();

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
  renderFocusBar(list);
  renderStats(list);
  renderMap(list);
  renderBeeswarm(list);
  renderSankey(list);
  renderNetwork(list);
  renderMatrix(list);
  renderLeaders(list);
  renderEvidence(list);
  renderList(list);
  writeUrl();
}
renderSupply();
readUrl();
// The flat map is the default; the 3D globe is one click away.
setView('flat');
render();
// A shared link to one incident: open its details and scroll to it once the page has laid out.
const linked = byId.get(decodeURIComponent(location.hash.slice(1)));
if (linked) setTimeout(() => { jumpTo(linked.id); }, 400);
