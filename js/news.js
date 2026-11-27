// News from the admin panel. The block stays hidden while there is nothing published.
const t = (s, v) => (window.I18N ? window.I18N.t(s, v) : typeof s === 'object' ? s.ru || s.uz || s.en || '' : s);
const section = document.querySelector('#news');
if (section) {
  try {
    const r = await fetch('/api/news', { cache: 'no-cache' });
    const items = r.ok ? await r.json() : [];
    if (Array.isArray(items) && items.length) render(items);
  } catch {
    /* no server: no news */
  }
}
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}
function render(items) {
  const grid = section.querySelector('#newsGrid');
  const locale = window.I18N?.locale || 'ru-RU';
  items.forEach((n, i) => {
    const card = el('article', 'news-card');
    card.style.setProperty('--i', i);
    if (n.image) {
      const img = el('img', 'news-img');
      img.src = n.image;
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      card.append(img);
    }
    const body = el('div', 'news-body');
    const d = new Date(`${n.date}T12:00:00`);
    const time = el('time', 'news-date', Number.isNaN(d.getTime()) ? n.date : (window.I18N ? window.I18N.date(d, { year: true }) : d.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })));
    time.dateTime = n.date;
    body.append(time, el('h4', null, t(n.title)));
    const full = t(n.text) || '';
    if (full) {
      const short = full.length > 220 ? `${full.slice(0, 220).replace(/\s+\S*$/, '')}…` : full;
      const p = el('p', 'news-text', short);
      body.append(p);
      if (short !== full) {
        const more = el('button', 'news-more', t('Читать полностью'));
        more.type = 'button';
        let open = false;
        more.addEventListener('click', () => {
          open = !open;
          p.textContent = open ? full : short;
          more.textContent = t(open ? 'Свернуть' : 'Читать полностью');
        });
        body.append(more);
      }
    }
    card.append(body);
    grid.append(card);
  });
  section.hidden = false;
}
