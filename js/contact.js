// "Call us": tel: links everywhere, an "on duty now / back at 8:00" status from SITE.schedule,
// and the phone call bar at the bottom of the information part. Independent of the 3D story.
import { SITE } from './config.js';

const tel = String(SITE.phoneLink || '').replace(/[^\d+]/g, '');
const calls = [...document.querySelectorAll('[data-tel]')];
const dock = document.querySelector('#dock');

if (!tel) {
  // no number in the config: no call buttons at all
  calls.forEach((a) => a.remove());
  dock?.querySelector('.dock-call')?.remove();
} else {
  for (const a of calls) {
    a.href = `tel:${tel}`;
    a.addEventListener('click', () => {
      try { if (SITE.metrika) window.ym?.(Number(SITE.metrika), 'reachGoal', 'call'); } catch { /* analytics is optional */ }
    });
  }
  document.querySelectorAll('[data-phone-text]').forEach((el) => (el.textContent = SITE.phone || tel));
  initStatus();
}

/* ---------- working hours ---------- */
function initStatus() {
  const S = SITE.schedule;
  const els = [...document.querySelectorAll('.call-status')];
  if (!S || !Array.isArray(S.days) || !S.from || !S.to) { els.forEach((e) => e.remove()); return; }
  const toMin = (s) => { const [h, m] = String(s).split(':').map(Number); return h * 60 + (m || 0); };
  const from = toMin(S.from), to = toMin(S.to);
  const DAYS = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  const t = (s, v) => (window.I18N ? window.I18N.t(s, v) : String(s).replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? v[k] : m)));
  const SHORT = ['', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
  let fmt;
  try {
    fmt = new Intl.DateTimeFormat('en-GB', { timeZone: S.timeZone || undefined, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  } catch {
    fmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); // unknown time zone name
  }
  const hhmm = S.from.replace(/^0(\d)/, '$1');
  function status() {
    const p = Object.fromEntries(fmt.formatToParts(new Date()).map((x) => [x.type, x.value]));
    const day = DAYS[p.weekday] || 1;
    const min = Number(p.hour) * 60 + Number(p.minute);
    if (S.days.includes(day) && min >= from && min < to) return { open: true, text: t('На связи сейчас') };
    if (S.days.includes(day) && min < from) return { open: false, text: t('Ответим с {time}', { time: hhmm }) };
    for (let k = 1; k <= 7; k++) {
      const d = ((day - 1 + k) % 7) + 1;
      if (S.days.includes(d)) return { open: false, text: k === 1 ? t('Ответим завтра с {time}', { time: hhmm }) : t('Ответим в {day} с {time}', { day: t(SHORT[d]), time: hhmm }) };
    }
    return { open: false, text: '' };
  }
  const paint = () => {
    const s = status();
    for (const e of els) { e.textContent = s.text; e.classList.toggle('open', s.open); }
  };
  paint();
  setInterval(paint, 60_000);
}

/* ---------- the call bar: phones, inside the information part, never over the keyboard ---------- */
if (dock) {
  // messengers only when set in the config
  for (const a of dock.querySelectorAll('[data-site]')) {
    const v = SITE[a.dataset.site];
    if (!v) { a.remove(); continue; }
    a.href = a.dataset.site === 'telegram' ? `https://t.me/${v}` : `https://wa.me/${String(v).replace(/\D/g, '')}`;
  }
  const about = document.querySelector('#about');
  let inAbout = false;
  let typing = false;
  const sync = () => dock.classList.toggle('show', inAbout && !typing && dock.children.length > 0);
  if (about) {
    new IntersectionObserver((en) => { inAbout = en[0].isIntersecting; sync(); }, { rootMargin: '0px 0px -45% 0px' }).observe(about);
  }
  // an on-screen keyboard is up while a field has focus
  addEventListener('focusin', (e) => { if (e.target.matches?.('input:not([type=checkbox]):not([type=radio]):not([type=range]), select, textarea')) { typing = true; sync(); } });
  addEventListener('focusout', () => { typing = false; setTimeout(sync, 150); });
}
