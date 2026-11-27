// INKUBIO: serves the site and e-mails orders from the "Заказать цыплят" form.
// Run: npm start   (settings are read from .env, see .env.example)
import http from 'node:http';
import { readFile, appendFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import nodemailer from 'nodemailer';
import { gzipSync } from 'node:zlib';
import { createAdmin } from './server/admin.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 5173;
const ORDERS_FILE = process.env.ORDERS_FILE || path.join(ROOT, 'orders.csv');
// admin data (site texts, news, statistics, uploaded photos): next to orders.csv on the server, ./data locally
const DATA_DIR = process.env.DATA_DIR || (process.env.ORDERS_FILE ? path.dirname(ORDERS_FILE) : path.join(ROOT, 'data'));
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
    admin.recordOrder();
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
  admin.recordOrder();
  console.log(`[order] отправлена (${ok.join(', ')}): ${o.breed} × ${o.qty}`);
  return json(res, 200, { ok: true, mailed: true });
}

/* ---------------- admin panel: server/admin.js (password from ADMIN_PASSWORD) ---------------- */
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
const admin = createAdmin({
  dataDir: DATA_DIR, password: process.env.ADMIN_PASSWORD || '', breeds: BREEDS, ordersFile: ORDERS_FILE,
  parseCsv, clientIp, makeLimiter, json, send,
});

/* ---------------- search engines ---------------- */
function siteOrigin(req) {
  const proto = (TRUST_PROXY && req.headers['x-forwarded-proto']) || (req.socket.encrypted ? 'https' : 'http');
  return `${proto}://${req.headers.host || 'localhost'}`;
}
function handleSeo(req, res, pathname) {
  const origin = siteOrigin(req);
  if (pathname === '/robots.txt') {
    return send(res, 200, `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nDisallow: /uploads/\nSitemap: ${origin}/sitemap.xml\n`, { 'Content-Type': 'text/plain; charset=utf-8' });
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
    if (await admin.handle(req, res, pathname)) return;
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
