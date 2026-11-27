// INKUBIO admin: login, statistics, orders with statuses, news, site content, image uploads.
// Everything is stored as small JSON files in DATA_DIR (on the VPS: /var/lib/inkubio), next to orders.csv.
import { readFile, writeFile, rename, mkdir, stat } from 'node:fs/promises';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHmac, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DAY = 86_400_000;
const today = () => new Date().toISOString().slice(0, 10);

/* ---------- small JSON store with atomic writes ---------- */
function store(file, fallback) {
  let data = fallback;
  try { data = JSON.parse(readFileSync(file, 'utf8')); } catch { /* first run */ }
  let timer = null;
  const save = async () => {
    const tmp = `${file}.tmp`;
    await writeFile(tmp, JSON.stringify(data, null, 1), 'utf8');
    await rename(tmp, file);
  };
  return {
    get: () => data,
    set: async (d) => { data = d; await save(); },
    // for frequent small changes (statistics): write at most every 20 s
    touch() { if (!timer) timer = setTimeout(() => { timer = null; save().catch((e) => console.error('[admin] save', e.message)); }, 20_000); },
    flush: () => save(),
  };
}

/* ---------- validation of what the admin sends ---------- */
const str = (v, max = 300) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max) : '');
const num = (v, min = -1e12, max = 1e12) => { const n = Number(v); return v === '' || v == null || !Number.isFinite(n) ? null : Math.min(max, Math.max(min, n)); };
const bool = (v) => v === true || v === 'true' || v === 1;
// a text in one language, or { ru, uz, en }
function i18n(v, max = 300) {
  if (typeof v === 'string') return str(v, max);
  if (!v || typeof v !== 'object') return '';
  const o = {};
  for (const l of ['ru', 'uz', 'en']) { const s = str(v[l], max); if (s) o[l] = s; }
  return Object.keys(o).length ? o : '';
}
const date = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? String(v) : '');
const month = (v) => (/^\d{4}-\d{2}(-\d{2})?$/.test(String(v)) ? String(v).slice(0, 7) : '');
const img = (v) => { const s = str(v, 200); return /^\/uploads\/[a-f0-9]{16}\.(jpg|png|webp)$/.test(s) || /^photos\/[\w.-]+\.(jpe?g|png|webp)$/i.test(s) ? s : ''; };
const list = (v, max, fn) => (Array.isArray(v) ? v.slice(0, max).map(fn).filter(Boolean) : []);

function cleanContent(c, BREEDS) {
  const o = {};
  if (!c || typeof c !== 'object') return o;
  if ('phone' in c) { o.phone = str(c.phone, 40); o.phoneLink = o.phone.replace(/[^\d+]/g, ''); }
  if ('email' in c) o.email = str(c.email, 120);
  if ('telegram' in c) o.telegram = str(c.telegram, 64).replace(/^@|^https?:\/\/t\.me\//, '');
  if ('whatsapp' in c) o.whatsapp = str(c.whatsapp, 20).replace(/\D/g, '');
  if ('address' in c) o.address = i18n(c.address, 300);
  if ('hours' in c) o.hours = i18n(c.hours, 120);
  if ('currency' in c) o.currency = str(c.currency, 12);
  if ('reviewLink' in c) { const u = str(c.reviewLink, 300); o.reviewLink = /^https:\/\//.test(u) ? u : ''; }
  if ('metrika' in c) o.metrika = str(c.metrika, 20).replace(/\D/g, '');
  if ('delivery' in c) o.delivery = num(c.delivery, 0);
  if (c.prices && typeof c.prices === 'object') { o.prices = {}; for (const b of BREEDS) o.prices[b] = num(c.prices[b], 0); }
  if (c.calc && typeof c.calc === 'object') o.calc = { feedPrice: num(c.calc.feedPrice, 0), salePrice: num(c.calc.salePrice, 0), survival: num(c.calc.survival, 50, 100) ?? 95 };
  if (c.schedule && typeof c.schedule === 'object') {
    const t = (s) => (/^\d{1,2}:\d{2}$/.test(String(s)) ? String(s).padStart(5, '0') : '');
    o.schedule = { days: list(c.schedule.days, 7, (d) => (Number.isInteger(+d) && +d >= 1 && +d <= 7 ? +d : null)), from: t(c.schedule.from) || '08:00', to: t(c.schedule.to) || '18:00', timeZone: str(c.schedule.timeZone, 40) };
  }
  if ('stats' in c) o.stats = list(c.stats, 8, (s) => (num(s?.value, 0) != null && i18n(s?.label) ? { value: num(s.value, 0), label: i18n(s.label, 80) } : null));
  if ('photos' in c) o.photos = list(c.photos, 40, (p) => (img(p?.src) ? { src: img(p.src), caption: i18n(p.caption, 160), wide: bool(p.wide) } : null));
  if ('reviews' in c) {
    o.reviews = list(c.reviews, 60, (r) => (i18n(r?.text, 1200) ? {
      name: str(r.name, 80), place: i18n(r.place, 120), breed: BREEDS.includes(r.breed) ? r.breed : '', qty: num(r.qty, 0, 1e7),
      text: i18n(r.text, 1200), rating: num(r.rating, 1, 5), date: month(r.date), photo: img(r.photo),
    } : null));
  }
  if ('hatches' in c) o.hatches = list(c.hatches, 30, (h) => (date(h?.date) && BREEDS.includes(h.breed) ? { date: date(h.date), breed: h.breed, left: num(h.left, 0, 1e8) } : null));
  if (c.deliveryMap && typeof c.deliveryMap === 'object') {
    const DIRS = ['С', 'СВ', 'В', 'ЮВ', 'Ю', 'ЮЗ', 'З', 'СЗ'];
    o.deliveryMap = {
      cities: list(c.deliveryMap.cities, 150, (x) => (str(x?.name, 60) && num(x.km, 1, 5000) ? { name: str(x.name, 60), km: num(x.km, 1, 5000), dir: DIRS.includes(x.dir) ? x.dir : 'С' } : null)),
    };
  }
  return o;
}

function cleanNews(n) {
  const title = i18n(n?.title, 200);
  if (!title) return null;
  return {
    id: typeof n.id === 'string' && /^[a-f0-9]{12}$/.test(n.id) ? n.id : randomBytes(6).toString('hex'),
    date: date(n.date) || today(),
    title,
    text: i18n(n.text, 6000),
    image: img(n.image),
    published: n.published !== false,
  };
}

/* ---------- images: check the real file type by its first bytes ---------- */
function imageType(b) {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b[0] === 0x89 && b.toString('latin1', 1, 4) === 'PNG') return 'png';
  if (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return null;
}

export function createAdmin({ dataDir, password, breeds, ordersFile, parseCsv, clientIp, makeLimiter, json, send, telegram }) {
  const enabled = Boolean(password);
  const UPLOADS = path.join(dataDir, 'uploads');
  // folders and the signing secret (kept on the server; changing ADMIN_PASSWORD also logs everyone out)
  try { mkdirSync(UPLOADS, { recursive: true }); } catch (e) { console.error('[admin] data folder:', e.message); }
  const ready = mkdir(UPLOADS, { recursive: true }).catch(() => {});
  const secretFile = path.join(dataDir, '.admin-secret');
  let secret;
  try { secret = readFileSync(secretFile, 'utf8'); } catch {
    secret = randomBytes(32).toString('hex');
    try { writeFileSync(secretFile, secret, { mode: 0o600 }); } catch { /* read-only: sessions last until restart */ }
  }
  const key = createHash('sha256').update(`${secret}:${password}`).digest();

  const content = store(path.join(dataDir, 'content.json'), {});
  const news = store(path.join(dataDir, 'news.json'), []);
  const stats = store(path.join(dataDir, 'stats.json'), { days: {} });
  const statuses = store(path.join(dataDir, 'order-status.json'), {});
  process.on('SIGTERM', () => { stats.flush().finally(() => process.exit(0)); });

  /* ---------- session cookie ---------- */
  const sign = (s) => createHmac('sha256', key).update(s).digest('base64url');
  const COOKIE = 'ink_admin';
  function loggedIn(req) {
    const m = /(?:^|;\s*)ink_admin=([^;]+)/.exec(req.headers.cookie || '');
    if (!m) return false;
    const [exp, sig] = m[1].split('.');
    if (!exp || !sig || Number(exp) < Date.now()) return false;
    const a = Buffer.from(sig), b = Buffer.from(sign(exp));
    return a.length === b.length && timingSafeEqual(a, b);
  }
  const secure = (req) => req.socket.encrypted || req.headers['x-forwarded-proto'] === 'https';
  const sameOrigin = (req) => {
    const o = req.headers.origin;
    if (!o) return true;
    try { return new URL(o).host === req.headers.host; } catch { return false; }
  };
  const fails = makeLimiter(10, 15 * 60_000);
  const hitLimit = makeLimiter(200, 10 * 60_000);

  async function body(req, limit = 300_000) {
    let size = 0;
    const chunks = [];
    for await (const c of req) {
      size += c.length;
      if (size > limit) throw Object.assign(new Error('too large'), { status: 413 });
      chunks.push(c);
    }
    return Buffer.concat(chunks);
  }
  const jsonBody = async (req, limit) => { try { return JSON.parse((await body(req, limit)).toString('utf8')); } catch (e) { throw Object.assign(e, { status: e.status || 400 }); } };

  /* ---------- statistics ---------- */
  function dayRec(d = today()) {
    const s = stats.get();
    s.days ||= {};
    return (s.days[d] ||= { views: 0, visitors: 0, orders: 0, opens: 0, langs: {}, devices: {}, refs: {}, chapters: [0, 0, 0, 0, 0, 0, 0] });
  }
  const bump = (obj, k, by = 1) => { obj[k] = (obj[k] || 0) + by; };
  function recordHit(h) {
    const d = dayRec();
    if (h.t === 'view') {
      d.views++;
      if (h.first) d.visitors++;
      if (['uz', 'ru', 'en'].includes(h.lang)) bump(d.langs, h.lang);
      bump(d.devices, Number(h.w) && Number(h.w) < 760 ? 'mobile' : 'desktop');
      const ref = str(h.ref, 80).toLowerCase().replace(/^www\./, '');
      bump(d.refs, /^[a-z0-9.-]+$/.test(ref) && ref ? ref : 'direct');
      if (Object.keys(d.refs).length > 60) delete d.refs[Object.keys(d.refs).find((k) => k !== 'direct')];
    } else if (h.t === 'open') d.opens++;
    else if (h.t === 'chapter') { const i = Number(h.v); if (Number.isInteger(i) && i >= 0 && i < 7) d.chapters[i]++; }
    // keep a year of history
    const s = stats.get();
    const keys = Object.keys(s.days).sort();
    while (keys.length > 400) delete s.days[keys.shift()];
    stats.touch();
  }
  function recordOrder() { dayRec().orders++; stats.touch(); }

  /* ---------- orders from orders.csv, with statuses ---------- */
  async function orders() {
    const csv = existsSync(ordersFile) ? await readFile(ordersFile, 'utf8') : '';
    const rows = parseCsv(csv);
    const head = rows.shift() || [];
    const st = statuses.get();
    return {
      head,
      rows: rows.reverse().map((r) => {
        const id = createHash('sha1').update(r.slice(0, 4).join('|')).digest('hex').slice(0, 12);
        return { id, cells: r, status: st[id] || 'new' };
      }),
    };
  }

  function summary(days) {
    const s = stats.get().days || {};
    const out = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * DAY).toISOString().slice(0, 10);
      out.push({ date: d, ...(s[d] || { views: 0, visitors: 0, orders: 0, opens: 0, langs: {}, devices: {}, refs: {}, chapters: [0, 0, 0, 0, 0, 0, 0] }) });
    }
    return out;
  }

  /* ---------- the page and the API ---------- */
  return {
    enabled,
    recordOrder,
    // public: content overrides and news for the site
    publicContent: () => content.get(),
    async handle(req, res, pathname) {
      const method = req.method;
      // site → server
      if (pathname === '/api/hit' && method === 'POST') {
        if (hitLimit.hit(clientIp(req))) return send(res, 204), true;
        try { recordHit(await jsonBody(req, 2000)); } catch { /* ignore broken beacons */ }
        return send(res, 204), true;
      }
      if (pathname === '/api/content' && method === 'GET') return json(res, 200, content.get()), true;
      if (pathname === '/api/news' && method === 'GET') {
        const items = news.get().filter((n) => n.published).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30);
        return json(res, 200, items), true;
      }
      if (pathname.startsWith('/uploads/') && (method === 'GET' || method === 'HEAD')) {
        const name = pathname.slice(9);
        if (!/^[a-f0-9]{16}\.(jpg|png|webp)$/.test(name)) return send(res, 404, 'Not found'), true;
        try {
          const f = path.join(UPLOADS, name);
          await stat(f);
          const type = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[name.split('.').pop()];
          send(res, 200, method === 'HEAD' ? undefined : await readFile(f), { 'Content-Type': type, 'Cache-Control': 'public, max-age=31536000, immutable' });
        } catch { send(res, 404, 'Not found'); }
        return true;
      }

      if (pathname !== '/admin' && !pathname.startsWith('/admin/') && !pathname.startsWith('/api/admin/')) return false;
      if (!enabled) return send(res, 404, 'Not found'), true;
      if (pathname === '/admin' || pathname === '/admin/') {
        const html = await readFile(path.join(HERE, 'admin.html'));
        return send(res, 200, html, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer' }), true;
      }
      if (method !== 'GET' && !sameOrigin(req)) return json(res, 403, { ok: false, error: 'origin' }), true;

      if (pathname === '/api/admin/login' && method === 'POST') {
        const ip = clientIp(req);
        if (fails.over(ip)) return json(res, 429, { ok: false, error: 'rate' }), true;
        let b = {};
        try { b = await jsonBody(req, 2000); } catch { /* empty */ }
        const a = Buffer.from(String(b.password || '')), p = Buffer.from(password);
        if (!(a.length === p.length && timingSafeEqual(a, p))) { fails.hit(ip); return json(res, 401, { ok: false, error: 'password' }), true; }
        const exp = String(Date.now() + 14 * DAY);
        send(res, 200, JSON.stringify({ ok: true }), {
          'Content-Type': 'application/json',
          'Set-Cookie': `${COOKIE}=${exp}.${sign(exp)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${14 * 86400}${secure(req) ? '; Secure' : ''}`,
        });
        return true;
      }
      if (pathname === '/api/admin/logout' && method === 'POST') {
        return send(res, 200, '{"ok":true}', { 'Content-Type': 'application/json', 'Set-Cookie': `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0` }), true;
      }
      if (!loggedIn(req)) return json(res, 401, { ok: false, error: 'login' }), true;
      await ready;

      if (pathname === '/api/admin/me') return json(res, 200, { ok: true, breeds, dataDir: path.basename(dataDir) }), true;
      if (pathname === '/api/admin/stats') {
        const days = Math.min(365, Math.max(7, Number(new URL(req.url, 'http://x').searchParams.get('days')) || 30));
        return json(res, 200, { days: summary(days) }), true;
      }
      if (pathname === '/api/admin/orders' && method === 'GET') return json(res, 200, await orders()), true;
      if (pathname === '/admin/orders.csv') {
        const csv = existsSync(ordersFile) ? await readFile(ordersFile, 'utf8') : '';
        return send(res, 200, '﻿' + csv.replace(/^﻿/, ''), { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="orders.csv"', 'Cache-Control': 'no-store' }), true;
      }
      if (pathname === '/api/admin/order-status' && method === 'POST') {
        const b = await jsonBody(req, 1000);
        if (!/^[a-f0-9]{12}$/.test(String(b.id)) || !['new', 'work', 'done', 'cancel'].includes(b.status)) return json(res, 400, { ok: false }), true;
        await statuses.set({ ...statuses.get(), [b.id]: b.status });
        return json(res, 200, { ok: true }), true;
      }
      if (pathname === '/api/admin/content') {
        if (method === 'GET') return json(res, 200, content.get()), true;
        if (method === 'PUT') {
          const c = cleanContent(await jsonBody(req, 400_000), breeds);
          await content.set(c);
          return json(res, 200, { ok: true, content: c }), true;
        }
      }
      if (pathname === '/api/admin/news') {
        if (method === 'GET') return json(res, 200, [...news.get()].sort((a, b) => b.date.localeCompare(a.date))), true;
        if (method === 'PUT') {
          const n = cleanNews(await jsonBody(req, 100_000));
          if (!n) return json(res, 400, { ok: false, error: 'title' }), true;
          const all = news.get().filter((x) => x.id !== n.id);
          all.push(n);
          await news.set(all.slice(-300));
          return json(res, 200, { ok: true, item: n }), true;
        }
        if (method === 'DELETE') {
          const id = new URL(req.url, 'http://x').searchParams.get('id');
          await news.set(news.get().filter((x) => x.id !== id));
          return json(res, 200, { ok: true }), true;
        }
      }
      if (pathname === '/api/admin/telegram') {
        if (!telegram) return json(res, 200, { enabled: false, subscribers: [] }), true;
        if (method === 'POST') {
          const b = await jsonBody(req, 1000);
          if (b.action === 'remove') await telegram.remove(String(b.id || ''));
          else if (b.action === 'newLink') await telegram.newLink();
        }
        return json(res, 200, telegram.info()), true;
      }
      if (pathname === '/api/admin/upload' && method === 'POST') {
        const b = await body(req, 8 * 1024 * 1024);
        const ext = imageType(b);
        if (!ext) return json(res, 415, { ok: false, error: 'type' }), true;
        const name = `${createHash('sha256').update(b).digest('hex').slice(0, 16)}.${ext}`;
        const f = path.join(UPLOADS, name);
        if (!existsSync(f)) await writeFile(f, b);
        return json(res, 200, { ok: true, url: `/uploads/${name}` }), true;
      }
      return json(res, 404, { ok: false }), true;
    },
  };
}
