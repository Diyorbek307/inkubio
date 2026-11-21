// Delivery map: zones around the hatchery, towns, a route with a little truck, and a "check your town" search.
// Drawn as our own SVG (no map tiles, no third-party requests), driven by SITE.deliveryMap in js/config.js.
import { SITE } from './config.js';

const section = document.querySelector('#dmap');
if (section) init();

function init() {
  const $ = (s) => document.querySelector(s);
  const demo = new URLSearchParams(location.search).has('demo');
  const M = SITE.deliveryMap || {};
  let cities = Array.isArray(M.cities) ? M.cities.filter((c) => c && c.name) : [];
  const isDemo = !cities.length && demo;
  if (isDemo) {
    cities = [
      { name: 'Город А', km: 60, dir: 'С' }, { name: 'Город Б', km: 95, dir: 'ЮВ' }, { name: 'Город В', km: 130, dir: 'З' },
      { name: 'Город Г', km: 210, dir: 'СВ' }, { name: 'Город Д', km: 260, dir: 'ЮЗ' }, { name: 'Город Е', km: 320, dir: 'В' },
      { name: 'Город Ж', km: 420, dir: 'С' }, { name: 'Город З', km: 520, dir: 'ЮВ' }, { name: 'Город И', km: 480, dir: 'СЗ' },
    ];
  }
  if (!cities.length) { section.remove(); return; }

  const zones = (Array.isArray(M.zones) && M.zones.length ? M.zones : [{ km: 150, label: 'В день вывода' }, { km: 350, label: 'В первые сутки' }, { km: 600, label: 'По договорённости' }])
    .filter((z) => z && z.km > 0)
    .sort((a, b) => a.km - b.km);
  const speed = M.speed || 60;
  const hub = M.hub || {};
  const tx = (s, v) => (window.I18N ? window.I18N.t(s, v) : String(s).replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? v[k] : m)));
  const fmt = new Intl.NumberFormat(window.I18N?.locale || 'ru-RU', { maximumFractionDigits: 0 });

  /* ---------- geometry: everything in "road km", polar around the hatchery ---------- */
  const DIRS = { С: 0, ССВ: 22.5, СВ: 45, ВСВ: 67.5, В: 90, ВЮВ: 112.5, ЮВ: 135, ЮЮВ: 157.5, Ю: 180, ЮЮЗ: 202.5, ЮЗ: 225, ЗЮЗ: 247.5, З: 270, ЗСЗ: 292.5, СЗ: 315, ССЗ: 337.5, N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315 };
  const ROAD = 1.25; // roads are ~25 % longer than a straight line
  const pts = [];
  for (const c of cities) {
    let km = Number(c.km) || 0;
    let ang = null;
    if (Number.isFinite(c.lat) && Number.isFinite(c.lon) && Number.isFinite(hub.lat) && Number.isFinite(hub.lon)) {
      const dx = (c.lon - hub.lon) * 111.32 * Math.cos((hub.lat * Math.PI) / 180);
      const dy = (c.lat - hub.lat) * 110.57;
      ang = (Math.atan2(dx, dy) * 180) / Math.PI;
      if (!km) km = Math.hypot(dx, dy) * ROAD;
    } else {
      ang = typeof c.dir === 'number' ? c.dir : DIRS[String(c.dir || '').toUpperCase()] ?? DIRS[c.dir] ?? (pts.length * 137.5) % 360;
    }
    if (!km) continue;
    pts.push({ ...c, km, ang });
  }
  if (!pts.length) { section.remove(); return; }
  const maxKm = Math.max(zones[zones.length - 1]?.km || 0, ...pts.map((p) => p.km)) * 1.08;
  const R = 440;
  const sc = R / maxKm;
  const xy = (km, ang) => [Math.sin((ang * Math.PI) / 180) * km * sc, -Math.cos((ang * Math.PI) / 180) * km * sc];
  const zoneOf = (km) => zones.find((z) => km <= z.km) || null;

  /* ---------- drawing ---------- */
  const svg = $('#dmapSvg');
  const NS = 'http://www.w3.org/2000/svg';
  const mk = (tag, attrs = {}, parent = svg) => {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    parent.append(n);
    return n;
  };
  const defs = mk('defs');
  defs.innerHTML = `
    <radialGradient id="dmHub"><stop offset="0" stop-color="#ffc93a" stop-opacity=".55"/><stop offset="1" stop-color="#ffc93a" stop-opacity="0"/></radialGradient>
    <linearGradient id="dmSweep" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffc93a" stop-opacity="0"/><stop offset="1" stop-color="#ffc93a" stop-opacity=".16"/></linearGradient>
    <pattern id="dmDots" width="28" height="28" patternUnits="userSpaceOnUse"><circle cx="14" cy="14" r="1.3" fill="rgba(246,242,234,.09)"/></pattern>
    <clipPath id="dmClip"><circle r="${R + 40}"/></clipPath>`;
  const base = mk('g', { 'clip-path': 'url(#dmClip)' });
  mk('circle', { r: R + 40, fill: 'url(#dmDots)' }, base);
  // zones, outer first so the inner ones sit on top
  const zoneAlpha = (i) => 0.05 + (zones.length - 1 - i) * 0.035;
  [...zones].reverse().forEach((z, ri) => {
    const i = zones.length - 1 - ri;
    mk('circle', { r: z.km * sc, class: 'dm-zone', 'data-zone': i, fill: `rgba(255,201,58,${zoneAlpha(i).toFixed(3)})`, stroke: 'rgba(255,201,58,.35)', 'stroke-width': 1.5, 'stroke-dasharray': '6 8' }, base);
  });
  // ring labels go where no town is: the direction with the widest gap
  const angDist = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
  let labelAng = 32;
  let best = -1;
  for (let a = 0; a < 360; a += 10) {
    const gap = Math.min(...pts.map((p) => angDist(a, p.ang)), 360);
    if (gap > best + 0.01 || (Math.abs(gap - best) < 0.01 && angDist(a, 150) < angDist(labelAng, 150))) { best = gap; labelAng = a; }
  }
  zones.forEach((z) => {
    const [x, y] = xy(z.km, labelAng);
    const t = mk('text', { x: x, y: y - 8, class: 'dm-ring-label', 'text-anchor': 'middle' }, base);
    t.textContent = tx('{km} км', { km: fmt.format(z.km) });
  });
  // compass
  for (const [l, a] of [['С', 0], ['В', 90], ['Ю', 180], ['З', 270]]) {
    const [x, y] = xy(maxKm * 0.985, a);
    const t = mk('text', { x, y: y + 5, class: 'dm-compass', 'text-anchor': 'middle' }, base);
    t.textContent = tx(l);
  }
  // radar sweep (decorative)
  const sweep = mk('g', { class: 'dm-sweep' }, base);
  mk('path', { d: `M0 0 L${R + 40} 0 A${R + 40} ${R + 40} 0 0 0 ${((R + 40) * Math.cos(-0.7)).toFixed(1)} ${((R + 40) * Math.sin(-0.7)).toFixed(1)} Z`, fill: 'url(#dmSweep)' }, sweep);

  // route + truck (shown for the chosen town)
  const route = mk('path', { class: 'dm-route', fill: 'none' });
  const truck = mk('g', { class: 'dm-truck' });
  truck.innerHTML = '<g class="dm-mark"><rect x="-13" y="-8" width="17" height="14" rx="3" fill="#f6f2ea"/><path d="M4 -4h6l5 5v5H4z" fill="#ffc93a"/><circle cx="-7" cy="7" r="3.2" fill="#17130a" stroke="#f6f2ea" stroke-width="1.5"/><circle cx="9" cy="7" r="3.2" fill="#17130a" stroke="#f6f2ea" stroke-width="1.5"/></g>';

  // towns: marks keep the same size on screen whatever the map width (.dm-mark scales by --ik)
  const towns = pts.map((p) => {
    const [x, y] = xy(p.km, p.ang);
    const g = mk('g', { class: 'dm-town', tabindex: 0, role: 'button', 'aria-label': tx('{name}, около {km} км', { name: p.name, km: fmt.format(p.km) }), transform: `translate(${x.toFixed(1)} ${y.toFixed(1)})` });
    const m = mk('g', { class: 'dm-mark' }, g);
    mk('circle', { r: 16, class: 'dm-halo' }, m);
    mk('circle', { r: 6.5, class: 'dm-dot' }, m);
    mk('title', {}, g).textContent = p.name;
    const t = mk('text', { y: 5, class: 'dm-label' }, m);
    t.textContent = p.name;
    g.addEventListener('click', () => select(p));
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(p); } });
    return { p, g, t, x, y };
  });
  // labels flip to the left near the right edge and dodge each other a little
  let ik = 1;
  function layout() {
    const k = (svg.clientWidth || 600) / 1000;
    ik = Math.max(1, 0.78 / k);
    svg.style.setProperty('--ik', ik.toFixed(3));
    // obstacles: the hatchery mark and every town dot; labels are boxes that must not overlap them or each other
    const boxes = [{ x1: -16 * ik, x2: 16 * ik, y1: -18 * ik, y2: 18 * ik }];
    for (const tw of towns) boxes.push({ x1: tw.x - 9 * ik, x2: tw.x + 9 * ik, y1: tw.y - 9 * ik, y2: tw.y + 9 * ik });
    const order = [...towns].sort((a, b) => (b.g.classList.contains('on') - a.g.classList.contains('on')) || a.p.km - b.p.km);
    for (const tw of order) {
      const { x, y, t, p } = tw;
      const w = (p.name.length * 9.2 + 6) * ik;
      const box = (left) => ({ x1: left ? x - 14 * ik - w : x + 14 * ik, x2: left ? x - 14 * ik : x + 14 * ik + w, y1: y - 10 * ik, y2: y + 10 * ik });
      const free = (b) => b.x1 > -R - 40 && b.x2 < R + 40 && !boxes.some((q) => b.x1 < q.x2 && b.x2 > q.x1 && b.y1 < q.y2 && b.y2 > q.y1);
      const pref = x > R * 0.4;
      let side = free(box(pref)) ? pref : free(box(!pref)) ? !pref : null;
      // nowhere to put it: the chosen town still gets its label, the others keep just the dot (and their name on hover/in the list)
      if (side === null && tw.g.classList.contains('on')) side = pref;
      t.style.display = side === null ? 'none' : '';
      if (side === null) continue;
      boxes.push(box(side));
      t.setAttribute('x', side ? -14 : 14);
      t.setAttribute('text-anchor', side ? 'end' : 'start');
    }
  }
  // the hatchery itself
  const hubG = mk('g', { class: 'dm-hub dm-mark' });
  mk('circle', { r: 42, fill: 'url(#dmHub)' }, hubG);
  mk('circle', { r: 13, class: 'dm-pulse' }, hubG);
  mk('circle', { r: 13, class: 'dm-pulse p2' }, hubG);
  mk('path', { d: 'M0 -14 C8 -14 12 -2 12 5 C12 11 7 15 0 15 C-7 15 -12 11 -12 5 C-12 -2 -8 -14 0 -14Z', fill: '#ffc93a', stroke: '#0e0e10', 'stroke-width': 3 }, hubG);
  mk('title', {}, hubG).textContent = hub.name || SITE.name || 'INKUBIO';

  /* ---------- side panel ---------- */
  const zl = $('#dmapZones');
  {
    const li = document.createElement('li');
    li.className = 'hub';
    li.innerHTML = `<i></i><b></b><span>${tx('инкубаторий, отсюда выезжает машина')}</span>`;
    li.querySelector('b').textContent = hub.name || SITE.name || 'INKUBIO';
    zl.append(li);
  }
  zones.forEach((z, i) => {
    const li = document.createElement('li');
    const sw = document.createElement('i');
    sw.style.background = `rgba(255,201,58,${(zoneAlpha(i) * 3.2).toFixed(2)})`;
    const b = document.createElement('b');
    b.textContent = tx('до {km} км', { km: fmt.format(z.km) });
    const s = document.createElement('span');
    s.textContent = tx(z.label || '');
    li.append(sw, b, s);
    zl.append(li);
  });
  const list = $('#dmapList');
  for (const p of pts) {
    const o = document.createElement('option');
    o.value = p.name;
    list.append(o);
  }
  if (isDemo) {
    const badge = document.createElement('span');
    badge.className = 'demo-badge';
    badge.textContent = tx('Пример · замените в js/config.js');
    $('#dmapTitle').after(badge);
  }

  const card = $('#dmapCard');
  const hours = (km) => {
    const h = km / speed + 0.5; // + loading and the hand-over
    return h < 1.5 ? tx('около часа') : tx('≈ {h} ч', { h: fmt.format(Math.round(h)) });
  };
  function orderButton(city) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pill solid';
    b.textContent = tx('Заказать с доставкой в {city}', { city });
    b.addEventListener('click', () => orderTo(city));
    return b;
  }
  function render(p) {
    card.replaceChildren();
    const h = document.createElement('h4');
    h.textContent = p.name;
    const nums = document.createElement('div');
    nums.className = 'dmap-nums';
    nums.innerHTML = `<div><b></b><span>${tx('по дороге')}</span></div><div><b></b><span>${tx('в пути')}</span></div>`;
    nums.children[0].querySelector('b').textContent = '≈ ' + tx('{km} км', { km: fmt.format(p.km) });
    nums.children[1].querySelector('b').textContent = hours(p.km);
    const z = zoneOf(p.km);
    const tag = document.createElement('p');
    tag.className = 'dmap-tag' + (z ? '' : ' far');
    tag.textContent = z ? tx(z.label) : tx('Дальше наших зон');
    const note = document.createElement('p');
    note.className = 'dmap-note';
    note.textContent = z ? tx(z.note || '') : tx('Такие поездки обсуждаем отдельно — оставьте заявку, посчитаем.');
    card.append(h, nums, tag, note, orderButton(p.name));
    card.classList.remove('swap');
    void card.offsetWidth;
    card.classList.add('swap');
  }
  function unknown(name) {
    card.replaceChildren();
    const h = document.createElement('h4');
    h.textContent = name;
    const note = document.createElement('p');
    note.className = 'dmap-note';
    note.textContent = tx('Этого города нет в списке, но, скорее всего, довезём. Оставьте заявку — менеджер посчитает срок и стоимость доставки.');
    card.append(h, note, orderButton(name));
    route.classList.remove('on');
    truck.classList.remove('on');
    for (const t of towns) t.g.classList.remove('on');
  }

  /* ---------- choosing a town: route draws in, the truck drives it ---------- */
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let anim = 0;
  function select(p) {
    for (const t of towns) t.g.classList.toggle('on', t.p === p);
    layout(); // the chosen town's label gets priority
    for (const z of svg.querySelectorAll('.dm-zone')) z.classList.toggle('hit', zoneOf(p.km) === zones[Number(z.dataset.zone)]);
    const t = towns.find((q) => q.p === p);
    // a gentle arc, bending clockwise
    const mx = t.x / 2, my = t.y / 2;
    const len = Math.hypot(t.x, t.y) || 1;
    const cx = mx + (-t.y / len) * len * 0.18, cy = my + (t.x / len) * len * 0.18;
    route.setAttribute('d', `M0 0 Q${cx.toFixed(1)} ${cy.toFixed(1)} ${t.x.toFixed(1)} ${t.y.toFixed(1)}`);
    const L = route.getTotalLength();
    route.style.strokeDasharray = `${L}`;
    route.style.strokeDashoffset = reduce ? '0' : `${L}`;
    route.classList.add('on');
    truck.classList.add('on');
    cancelAnimationFrame(anim);
    const t0 = performance.now();
    const dur = reduce ? 0 : 1400;
    const step = (now) => {
      const k = dur ? Math.min(1, (now - t0) / dur) : 1;
      const e = 1 - Math.pow(1 - k, 3);
      route.style.strokeDashoffset = `${L * (1 - e)}`;
      const a = route.getPointAtLength(L * e);
      const b = route.getPointAtLength(Math.min(L, L * e + 1));
      const deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
      const flip = Math.abs(deg) > 90 ? -1 : 1; // keep the truck upright
      truck.setAttribute('transform', `translate(${a.x.toFixed(1)} ${a.y.toFixed(1)}) rotate(${(flip < 0 ? deg + 180 : deg).toFixed(1)}) scale(${flip} 1)`);
      if (k < 1) anim = requestAnimationFrame(step);
    };
    anim = requestAnimationFrame(step);
    render(p);
    const inp = $('#dmapInput');
    if (inp.value.trim().toLowerCase() !== p.name.toLowerCase()) inp.value = p.name;
    lastQuery = inp.value.trim();
  }

  const input = $('#dmapInput');
  const find = (v) => pts.find((p) => p.name.toLowerCase() === v.trim().toLowerCase());
  input.addEventListener('input', () => { const p = find(input.value); if (p) select(p); });
  let lastQuery = '';
  const submit = () => {
    const v = input.value.trim();
    // Enter and the blur after it both land here: rebuilding the card twice would swallow the click on its button
    if (!v || v === lastQuery) return;
    lastQuery = v;
    const p = find(v) || pts.find((q) => q.name.toLowerCase().startsWith(v.toLowerCase()));
    if (p) select(p); else unknown(v.slice(0, 60));
  };
  input.addEventListener('change', submit);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });

  /* ---------- hand the town over to the order form ---------- */
  const f = $('#orderForm');
  const chip = $('#orderCity');
  function setCity(v) {
    f.city.value = v;
    chip.hidden = !v;
    chip.querySelector('b').textContent = v;
  }
  chip?.querySelector('button').addEventListener('click', () => setCity(''));
  f.addEventListener('reset', () => setTimeout(() => setCity(''), 0));
  function orderTo(city) {
    setCity(city);
    // the generic order button opens the dialog through main.js (or the simple-mode fallback)
    document.querySelector('.top [data-order], [data-order]:not([data-breed]):not([data-segment])')?.click();
  }

  section.hidden = false;
  layout();
  new ResizeObserver(layout).observe(svg);
  // the radar only spins while the map is on screen
  new IntersectionObserver((en) => section.classList.toggle('live', en[0].isIntersecting)).observe(svg);
}
