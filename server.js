// INKUBIO: serves the site and e-mails orders from the "Заказать цыплят" form.
// Run: npm start   (settings are read from .env, see .env.example)
import http from 'node:http';
import { readFile, appendFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import nodemailer from 'nodemailer';
import { gzipSync } from 'node:zlib';
import { timingSafeEqual } from 'node:crypto';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 5173;
const ORDERS_FILE = process.env.ORDERS_FILE || path.join(ROOT, 'orders.csv');
// '1' — behind nginx/Caddy; 'cloudflare' — published through a Cloudflare tunnel from this computer
const TRUST_CF = process.env.TRUST_PROXY === 'cloudflare';
const TRUST_RENDER = process.env.TRUST_PROXY === 'render'; // Render.com: traffic always comes through Cloudflare
const TRUST_PROXY = process.env.TRUST_PROXY === '1' || TRUST_CF || TRUST_RENDER;
const BREEDS = ['Ross 308', 'Cobb 500', 'Арбор Эйкерс'];

/* ---------------- mail ---------------- */
const { SMTP_HOST, SMTP_USER, SMTP_PASS, MAIL_TO } = process.env;
const SMTP_PORT = Number(process.env.SMTP_PORT) || 465;
const MAIL_FROM = process.env.MAIL_FROM || SMTP_USER;
const mailReady = Boolean(SMTP_HOST && MAIL_TO && MAIL_FROM);
const transport = mailReady
  ? nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === '1' : SMTP_PORT === 465,
      auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    })
  : null;

/* ---------------- telegram (optional) ---------------- */
const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = process.env;
const tgReady = Boolean(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID);
async function sendTelegram(o) {
  const text = [
    '🐣 Новая заявка с сайта',
    '',
    `Имя: ${o.name}`,
    `Телефон: ${o.phone}`,
    `Порода: ${o.breed}`,
    `Количество: ${o.qty.toLocaleString('ru-RU')} шт.`,
    `Желаемая дата: ${o.date ? o.date.split('-').reverse().join('.') : 'не указана'}`,
    ...(o.segment ? [`Тип хозяйства: ${o.segment}`] : []),
    ...(o.city ? [`Город доставки: ${o.city}`] : []),
    ...(o.lang && o.lang !== 'русский' ? [`Язык клиента: ${o.lang}`] : []),
  ].join('\n');
  const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text }),
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`Telegram ${r.status}`);
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function orderMail(o) {
  const rows = [
    ['Имя', o.name],
    ['Телефон', o.phone],
    ['Порода', o.breed],
    ['Количество', `${o.qty.toLocaleString('ru-RU')} шт.`],
    ['Желаемая дата', o.date ? o.date.split('-').reverse().join('.') : 'не указана'],
    ...(o.segment ? [['Тип хозяйства', o.segment]] : []),
    ...(o.city ? [['Город доставки', o.city]] : []),
    ...(o.lang && o.lang !== 'русский' ? [['Язык клиента', o.lang]] : []),
    ['Получена', o.receivedAt.toLocaleString('ru-RU')],
  ];
  return {
    from: `INKUBIO — сайт <${MAIL_FROM}>`,
    to: MAIL_TO,
    subject: `Новая заявка: ${o.breed} × ${o.qty.toLocaleString('ru-RU')} — ${o.name}`,
    text: `Новая заявка с сайта\n\n${rows.map(([k, v]) => `${k}: ${v}`).join('\n')}\n`,
    html: `<div style="font-family:Arial,sans-serif;font-size:15px;color:#15171a">
      <h2 style="margin:0 0 16px">Новая заявка с сайта</h2>
      <table cellpadding="8" style="border-collapse:collapse">
        ${rows.map(([k, v]) => `<tr><td style="color:#6b737b;border-bottom:1px solid #eee">${esc(k)}</td><td style="border-bottom:1px solid #eee"><b>${esc(v)}</b></td></tr>`).join('')}
      </table>
      <p style="margin-top:18px"><a href="tel:${esc(o.phone.replace(/[^\d+]/g, ''))}">Позвонить клиенту</a></p>
    </div>`,
  };
}

/* ---------------- validation ---------------- */
function parseOrder(body) {
  // control characters (new lines, tabs…) never reach the CSV, the e-mail or the admin page
  const str = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '');
  const o = {
    name: str(body.name, 100),
    phone: str(body.phone, 40),
    breed: str(body.breed, 40),
    qty: Number(body.qty),
    date: str(body.date, 10),
    segment: str(body.segment, 60),
    city: str(body.city, 80),
    lang: ({ uz: 'узбекский', ru: 'русский', en: 'английский' })[body.lang] || '',
  };
  const errors = [];
  if (o.name.length < 2) errors.push('name');
  if (o.phone.replace(/\D/g, '').length < 7 || !/^[\d\s()+\-]+$/.test(o.phone)) errors.push('phone');
  if (!BREEDS.includes(o.breed)) errors.push('breed');
  if (!Number.isInteger(o.qty) || o.qty < 1 || o.qty > 1_000_000) errors.push('qty');
  if (o.date && !/^\d{4}-\d{2}-\d{2}$/.test(o.date)) errors.push('date');
  if (!body.consent) errors.push('consent');
  return { o, errors };
}

/* ---------------- backup copy of every order ---------------- */
const csvCell = (v) => {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // keeps Excel from reading it as a formula
  return `"${s.replace(/"/g, '""')}"`;
};
const CSV_HEAD = ['Дата', 'Имя', 'Телефон', 'Порода', 'Количество', 'Желаемая дата', 'Письмо'];
const CSV_EXTRA = ['Тип хозяйства', 'Город', 'Язык']; // added later: older files simply lack these header cells
async function saveOrder(o, status) {
  const header = !existsSync(ORDERS_FILE) ? '﻿' + [...CSV_HEAD, ...CSV_EXTRA].map(csvCell).join(';') + '\r\n' : '';
  const line = [o.receivedAt.toLocaleString('ru-RU'), o.name, o.phone, o.breed, o.qty, o.date, status, o.segment, o.city, o.lang].map(csvCell).join(';');
  await appendFile(ORDERS_FILE, header + line + '\r\n', 'utf8');
}

/* ---------------- simple per-IP rate limit ---------------- */
function makeLimiter(max, windowMs) {
  const hits = new Map(); // ip -> { count, start }
  setInterval(() => {
    const now = Date.now();
    for (const [ip, h] of hits) if (now - h.start > windowMs) hits.delete(ip);
  }, 60_000).unref();
  return {
    hit(ip) {
      const now = Date.now();
      let h = hits.get(ip);
      if (!h || now - h.start > windowMs) hits.set(ip, (h = { count: 0, start: now }));
      return ++h.count > max;
    },
    over(ip) {
      const h = hits.get(ip);
      return !!h && Date.now() - h.start <= windowMs && h.count >= max;
    },
  };
}
const orderLimit = makeLimiter(5, 10 * 60_000);
const adminFails = makeLimiter(10, 15 * 60_000);
const limited = (ip) => orderLimit.hit(ip);
// behind a proxy the address the proxy itself saw is the last entry; the first one is client-controlled
function clientIp(req) {
  // through the tunnel every request arrives from cloudflared on this machine; Cloudflare puts the visitor's
  // address in CF-Connecting-IP (and overwrites any value the visitor sent). Only trusted from the local tunnel.
  const local = /^(::1|127\.|::ffff:127\.)/.test(req.socket.remoteAddress || '');
  if (TRUST_CF && local && req.headers['cf-connecting-ip']) return String(req.headers['cf-connecting-ip']);
  // on Render every request passes Cloudflare first, which sets CF-Connecting-IP / True-Client-IP itself
  if (TRUST_RENDER) {
    const cf = req.headers['cf-connecting-ip'] || req.headers['true-client-ip'];
    if (cf) return String(cf);
  }
  if (TRUST_PROXY) {
    const hops = String(req.headers['x-forwarded-for'] || '').split(',').map((x) => x.trim()).filter(Boolean);
    if (hops.length) return hops[hops.length - 1];
  }
  return req.socket.remoteAddress;
}

/* ---------------- http ---------------- */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};
const PUBLIC = ['css', 'js', 'vendor', 'fonts', 'photos', 'img'];
const PAGES = ['index.html', 'privacy.html'];
const gzCache = new Map();

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'X-Content-Type-Options': 'nosniff', ...headers });
  res.end(body);
}
const json = (res, status, obj) => send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });

async function readBody(req, limit = 10_000) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw Object.assign(new Error('too large'), { status: 413 });
    chunks.push(c);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function handleOrder(req, res) {
  const ip = clientIp(req);
  if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) return json(res, 415, { ok: false, error: 'bad_request' });
  if (limited(ip)) return json(res, 429, { ok: false, error: 'rate' });
  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch (e) {
    return json(res, e.status || 400, { ok: false, error: 'bad_request' });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json(res, 400, { ok: false, error: 'bad_request' });
  // honeypot: bots fill every field, people never see this one
  if (body.website) return json(res, 200, { ok: true });
  const { o, errors } = parseOrder(body);
  if (errors.length) return json(res, 422, { ok: false, error: 'invalid', fields: errors });
  o.receivedAt = new Date();

  if (!mailReady && !tgReady) {
    await saveOrder(o, 'почта не настроена');
    console.warn(`[order] сохранена в ${path.basename(ORDERS_FILE)}, но почта не настроена: ${o.name}, ${o.phone}`);
    return json(res, 200, { ok: true, mailed: false });
  }
  // send to every configured channel; the order counts as delivered if at least one worked
  const channels = [];
  if (mailReady) channels.push(['почта', () => transport.sendMail(orderMail(o))]);
  if (tgReady) channels.push(['Telegram', () => sendTelegram(o)]);
  const results = await Promise.allSettled(channels.map(([, fn]) => fn()));
  const ok = channels.filter((_, i) => results[i].status === 'fulfilled').map(([n]) => n);
  results.forEach((r, i) => r.status === 'rejected' && console.error(`[order] ${channels[i][0]}: не удалось отправить —`, r.reason?.message));
  await saveOrder(o, ok.length ? `отправлено (${ok.join(', ')})` : 'ошибка отправки').catch(() => {});
  if (!ok.length) return json(res, 502, { ok: false, error: 'mail' });
  console.log(`[order] отправлена (${ok.join(', ')}): ${o.breed} × ${o.qty}`);
  return json(res, 200, { ok: true, mailed: true });
}

/* ---------------- orders page for the team: /admin (password from ADMIN_PASSWORD) ---------------- */
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
function authorized(req) {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Basic ')) return false;
  const pass = Buffer.from(h.slice(6), 'base64').toString('utf8').split(':').slice(1).join(':');
  const a = Buffer.from(pass), b = Buffer.from(ADMIN_PASSWORD);
  return a.length === b.length && timingSafeEqual(a, b);
}
function parseCsv(text) {
  const rows = [];
  for (const line of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cells = [];
    let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') q = false;
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === ';') { cells.push(cur); cur = ''; }
      else cur += ch;
    }
    cells.push(cur);
    rows.push(cells.map((c) => c.replace(/^[\t']/, '')));
  }
  return rows;
}
async function handleAdmin(req, res, pathname) {
  if (!ADMIN_PASSWORD) return send(res, 404, 'Not found');
  const ip = clientIp(req);
  if (adminFails.over(ip)) return send(res, 429, 'Слишком много попыток. Попробуйте позже.', { 'Content-Type': 'text/plain; charset=utf-8', 'Retry-After': '900' });
  if (!authorized(req)) {
    if (req.headers.authorization) adminFails.hit(ip);
    return send(res, 401, 'Нужен пароль', { 'WWW-Authenticate': 'Basic realm="INKUBIO", charset="UTF-8"', 'Content-Type': 'text/plain; charset=utf-8' });
  }
  const csv = existsSync(ORDERS_FILE) ? await readFile(ORDERS_FILE, 'utf8') : '';
  if (pathname === '/admin/orders.csv') {
    return send(res, 200, '\uFEFF' + csv.replace(/^\uFEFF/, ''), { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="orders.csv"', 'Cache-Control': 'no-store' });
  }
  const rows = parseCsv(csv);
  const head = rows.shift() || [...CSV_HEAD, ...CSV_EXTRA];
  const width = Math.max(head.length, ...rows.map((r) => r.length));
  for (let i = head.length; i < width; i++) head.push(CSV_EXTRA[i - CSV_HEAD.length] || '');
  rows.reverse();
  const body = rows.map((r) => `<tr>${r.map((c, i) => `<td>${i === 2 ? `<a href="tel:${esc(c.replace(/[^\d+]/g, ''))}">${esc(c)}</a>` : esc(c)}</td>`).join('')}</tr>`).join('');
  const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Заявки — INKUBIO</title><style>
body{margin:0;background:#0c0c0e;color:#f6f2ea;font:15px/1.5 system-ui,sans-serif}main{max-width:1100px;margin:0 auto;padding:32px 16px}
h1{font-size:26px;margin:0 0 6px}p{color:#a9a49b;margin:0 0 20px}a{color:#ffc93a}.wrap{overflow-x:auto;border:1px solid #2a2a2e;border-radius:14px}
table{width:100%;border-collapse:collapse;min-width:720px}th,td{padding:11px 14px;text-align:left;border-bottom:1px solid #222226;white-space:nowrap}
th{background:#141417;color:#a9a49b;font-weight:600;position:sticky;top:0}tr:hover td{background:#141417}.btn{display:inline-block;margin-bottom:16px;padding:9px 16px;border-radius:999px;background:#ffc93a;color:#17130a;font-weight:700;text-decoration:none}
</style></head><body><main><h1>Заявки</h1><p>Всего: ${rows.length}. Новые сверху. Телефон — ссылка для звонка.</p>
<a class="btn" href="/admin/orders.csv">Скачать для Excel</a>
<div class="wrap"><table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${body || '<tr><td colspan="${head.length}">Заявок пока нет</td></tr>'}</tbody></table></div></main></body></html>`;
  return send(res, 200, html, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
}

/* ---------------- search engines ---------------- */
function siteOrigin(req) {
  const proto = (TRUST_PROXY && req.headers['x-forwarded-proto']) || (req.socket.encrypted ? 'https' : 'http');
  return `${proto}://${req.headers.host || 'localhost'}`;
}
function handleSeo(req, res, pathname) {
  const origin = siteOrigin(req);
  if (pathname === '/robots.txt') {
    return send(res, 200, `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nSitemap: ${origin}/sitemap.xml\n`, { 'Content-Type': 'text/plain; charset=utf-8' });
  }
  const today = new Date().toISOString().slice(0, 10);
  const urls = ['/', '/privacy.html'].map((u) => `<url><loc>${origin}${u}</loc><lastmod>${today}</lastmod></url>`).join('');
  return send(res, 200, `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`, { 'Content-Type': 'application/xml; charset=utf-8' });
}

async function handleStatic(req, res) {
  let rel;
  try {
    rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  } catch {
    return send(res, 400, 'Bad request');
  }
  if (rel.includes('\0')) return send(res, 400, 'Bad request');
  rel = rel.replace(/^[\\/]+/, '') || 'index.html';
  const file = path.resolve(ROOT, rel);
  // judge the RESOLVED path: "js/..%2F.env" must not reach .env, orders.csv or server.js
  const parts = path.relative(ROOT, file).split(path.sep);
  const top = parts[0];
  if (top === '..' || path.isAbsolute(path.relative(ROOT, file)) || (!PAGES.includes(parts.join('/')) && !(PUBLIC.includes(top) && parts.length > 1))) return send(res, 404, 'Not found');
  try {
    const st = await stat(file);
    if (!st.isFile()) return send(res, 404, 'Not found');
    const ext = path.extname(file).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    const cache = top === 'vendor' || top === 'fonts' ? 'public, max-age=2592000, immutable' : 'no-cache';
    const headers = { 'Content-Type': type, 'Cache-Control': cache, 'Last-Modified': st.mtime.toUTCString(), Vary: 'Accept-Encoding' };
    if (req.headers['if-modified-since'] && new Date(req.headers['if-modified-since']) >= new Date(st.mtime.toUTCString())) return send(res, 304, undefined, headers);
    let body = await readFile(file);
    // text files go out gzip-compressed (the 3D library shrinks from ~670 KB to ~170 KB)
    if (['.html', '.js', '.css', '.json', '.svg'].includes(ext) && /gzip/.test(req.headers['accept-encoding'] || '')) {
      const hitC = gzCache.get(file);
      if (!hitC || hitC.mtime !== st.mtimeMs) gzCache.set(file, { mtime: st.mtimeMs, data: gzipSync(body, { level: 9 }) });
      body = gzCache.get(file).data;
      headers['Content-Encoding'] = 'gzip';
    }
    send(res, 200, req.method === 'HEAD' ? undefined : body, headers);
  } catch {
    send(res, 404, 'Not found');
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, 'http://x');
    if (pathname === '/admin' || pathname === '/admin/orders.csv') return await handleAdmin(req, res, pathname);
    if (pathname === '/robots.txt' || pathname === '/sitemap.xml') return handleSeo(req, res, pathname);
    if (pathname === '/api/order') {
      if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method' });
      return await handleOrder(req, res);
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
    return await handleStatic(req, res);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) json(res, 500, { ok: false, error: 'server' });
  }
});

server.listen(PORT, async () => {
  console.log(`INKUBIO: http://localhost:${PORT}`);
  if (tgReady) console.log('✓ Telegram: заявки дублируются в чат');
  if (!mailReady) {
    if (!tgReady) console.warn('⚠ Почта не настроена: заявки сохраняются только в orders.csv. Заполните .env (см. .env.example).');
    return;
  }
  try {
    await transport.verify();
    console.log(`✓ SMTP ${SMTP_HOST}:${SMTP_PORT} — заявки уходят на ${MAIL_TO}`);
  } catch (err) {
    console.error(`✗ SMTP ${SMTP_HOST}:${SMTP_PORT} не принимает подключение: ${err.message}`);
  }
});
