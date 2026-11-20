// Photos and customer reviews from js/config.js. Independent of the 3D story, so it also works in the simple (no-WebGL) mode.
// Empty lists keep both blocks hidden. /?demo shows marked examples so the layout can be previewed before real content exists.
import { SITE } from './config.js';

const $ = (s) => document.querySelector(s);
const demo = new URLSearchParams(location.search).has('demo');

/* ---------- demo content: clearly marked, never shown without ?demo ---------- */
function demoPhoto(i, label) {
  const hues = [[38, 24], [28, 12], [45, 30], [20, 8], [34, 18], [50, 26]];
  const [a, b] = hues[i % hues.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${a} 60% 32%)"/><stop offset="1" stop-color="hsl(${b} 40% 10%)"/></linearGradient></defs><rect width="800" height="600" fill="url(#g)"/><ellipse cx="400" cy="280" rx="62" ry="80" fill="none" stroke="rgba(255,240,210,.3)" stroke-width="6"/></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
const DEMO_PHOTOS = [
  { label: 'Инкубаторный зал', caption: 'Пример подписи: инкубаторный зал' },
  { label: 'Закладка яиц', caption: 'Пример подписи: закладка яиц' },
  { label: 'Овоскопирование', caption: 'Пример подписи: просвечиваем яйца' },
  { label: 'Вывод', caption: 'Пример подписи: цыплята в первые часы' },
  { label: 'Вакцинация', caption: 'Пример подписи: вакцинация на линии' },
  { label: 'Отгрузка', caption: 'Пример подписи: машина с климат-контролем' },
].map((p, i) => ({ src: demoPhoto(i, p.label), caption: p.caption, alt: p.label }));
const DEMO_REVIEWS = [
  { name: 'Имя клиента', place: 'Город, личное подворье', text: 'Пример отзыва. Здесь будет настоящий отзыв клиента: какую партию брал, как цыплята доехали, как растут.', rating: 5, date: '2026-10' },
  { name: 'Имя клиента', place: 'Регион, фермерское хозяйство', text: 'Пример отзыва. Лучше всего работают конкретные детали: сколько голов, какая сохранность, что понравилось в работе.', rating: 5, date: '2026-09' },
  { name: 'Название хозяйства', place: 'Регион, птицефабрика', text: 'Пример отзыва. Отзыв от крупного клиента с названием хозяйства вызывает больше доверия.', rating: 5, date: '2026-08' },
  { name: 'Имя клиента', place: 'Город, личное подворье', text: 'Пример отзыва. Можно добавить фото клиента — оно появится вместо инициалов.', rating: 4, date: '2026-08' },
];

const photos = (Array.isArray(SITE.photos) && SITE.photos.length ? SITE.photos : demo ? DEMO_PHOTOS : []).filter((p) => p && p.src);
const reviews = (Array.isArray(SITE.reviews) && SITE.reviews.length ? SITE.reviews : demo ? DEMO_REVIEWS : []).filter((r) => r && r.text);
const isDemoPhotos = !(SITE.photos || []).length && demo;
const isDemoReviews = !(SITE.reviews || []).length && demo;

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const demoBadge = () => el('span', 'demo-badge', 'Пример · замените в js/config.js');

/* ---------- gallery ---------- */
if (photos.length) {
  const grid = $('#galleryGrid');
  photos.forEach((p, i) => {
    const b = el('button', 'g-item');
    b.type = 'button';
    b.style.setProperty('--i', i);
    if (p.wide) b.classList.add('wide');
    b.setAttribute('aria-label', `Открыть фото: ${p.caption || p.alt || i + 1}`);
    const img = el('img');
    img.src = p.src;
    img.alt = p.alt || p.caption || '';
    img.loading = 'lazy';
    img.decoding = 'async';
    b.append(img);
    if (p.caption) b.append(el('span', 'g-cap', p.caption));
    b.addEventListener('click', () => openLightbox(i));
    grid.append(b);
  });
  if (isDemoPhotos) $('#gallery .section-title').after(demoBadge());
  $('#gallery').hidden = false;
  // no holes in the last row: the last photo stretches over the free cells
  const fill = () => {
    const items = [...grid.children];
    items.forEach((b) => b.style.removeProperty('grid-column'));
    const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').length;
    const cells = items.reduce((n, b) => n + (b.matches(':first-child, .wide') ? Math.min(4, cols * 2) : 1), 0);
    const free = (cols - (cells % cols)) % cols;
    const last = items[items.length - 1];
    if (free && items.length > 1 && !last.matches(':first-child, .wide')) last.style.gridColumn = `span ${free + 1}`;
  };
  fill();
  addEventListener('resize', fill);
} else $('#gallery').remove();

/* ---------- lightbox ---------- */
const lb = $('#lightbox');
let cur = 0;
function show(i) {
  cur = (i + photos.length) % photos.length;
  const p = photos[cur];
  const img = $('#lbImg');
  img.classList.remove('in');
  img.src = p.src;
  img.alt = p.alt || p.caption || '';
  img.decode?.().catch(() => {}).then(() => img.classList.add('in'));
  $('#lbCap').textContent = p.caption || '';
  $('#lbCount').textContent = photos.length > 1 ? `${cur + 1} / ${photos.length}` : '';
  // warm the neighbours so arrows feel instant
  for (const d of [1, -1]) new Image().src = photos[(cur + d + photos.length) % photos.length].src;
}
function openLightbox(i) {
  show(i);
  lb.showModal();
  document.documentElement.classList.add('locked');
}
if (lb) {
  const multi = photos.length > 1;
  $('#lbPrev').hidden = !multi;
  $('#lbNext').hidden = !multi;
  $('#lbPrev').addEventListener('click', () => show(cur - 1));
  $('#lbNext').addEventListener('click', () => show(cur + 1));
  $('#lbClose').addEventListener('click', () => lb.close());
  lb.addEventListener('close', () => {
    // the order dialog may still be open underneath
    if (!document.querySelector('#orderDialog')?.open) document.documentElement.classList.remove('locked');
  });
  lb.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') show(cur - 1);
    if (e.key === 'ArrowRight') show(cur + 1);
  });
  let down = false;
  lb.addEventListener('pointerdown', (e) => (down = e.target === lb || e.target.classList.contains('lb-fig')));
  lb.addEventListener('click', (e) => { if (down && (e.target === lb || e.target.classList.contains('lb-fig'))) lb.close(); });
  // swipe on phones
  let sx = null;
  lb.addEventListener('touchstart', (e) => (sx = e.touches[0].clientX), { passive: true });
  lb.addEventListener('touchend', (e) => {
    if (sx === null || !multi) return;
    const dx = e.changedTouches[0].clientX - sx;
    if (Math.abs(dx) > 50) show(cur + (dx < 0 ? 1 : -1));
    sx = null;
  });
}

/* ---------- reviews ---------- */
const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
function fmtDate(d) {
  const m = /^(\d{4})-(\d{2})/.exec(d || '');
  return m ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : d || '';
}
if (reviews.length) {
  const track = $('#reviewsTrack');
  reviews.forEach((r, i) => {
    const card = el('figure', 'rv-card');
    card.style.setProperty('--i', i);
    const rating = Math.max(0, Math.min(5, Math.round(Number(r.rating) || 0)));
    if (rating) {
      const stars = el('div', 'rv-stars', '★'.repeat(rating) + '☆'.repeat(5 - rating));
      stars.setAttribute('role', 'img');
      stars.setAttribute('aria-label', `Оценка ${rating} из 5`);
      card.append(stars);
    }
    const quote = el('blockquote', 'rv-text');
    quote.append(el('p', null, r.text));
    card.append(quote);
    if (r.photo) {
      // a photo from the customer's farm, opens bigger on click
      const shot = el('img', 'rv-shot');
      shot.src = r.photo;
      shot.alt = `Фото от клиента: ${r.name || ''}`;
      shot.loading = 'lazy';
      card.append(shot);
    }
    const cap = el('figcaption', 'rv-who');
    const ava = el('span', 'rv-ava');
    if (r.avatar) {
      const a = el('img');
      a.src = r.avatar;
      a.alt = '';
      a.loading = 'lazy';
      ava.append(a);
    } else {
      ava.textContent = (r.name || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
    }
    const who = el('span', 'rv-meta');
    who.append(el('b', null, r.name || 'Клиент'));
    const sub = [r.place, r.breed && r.qty ? `${r.breed}, ${r.qty} гол.` : r.breed, fmtDate(r.date)].filter(Boolean).join(' · ');
    if (sub) who.append(el('span', null, sub));
    cap.append(ava, who);
    card.append(cap);
    track.append(card);
  });
  if (isDemoReviews) $('#reviews .reviews-head > div').append(demoBadge());

  // arrows scroll one card; hidden when everything fits
  const step = () => (track.firstElementChild?.getBoundingClientRect().width || 300) + 14;
  $('#rvPrev').addEventListener('click', () => track.scrollBy({ left: -step(), behavior: 'smooth' }));
  $('#rvNext').addEventListener('click', () => track.scrollBy({ left: step(), behavior: 'smooth' }));
  const syncNav = () => {
    const over = track.scrollWidth > track.clientWidth + 4;
    $('.reviews-nav').hidden = !over;
    $('#rvPrev').disabled = track.scrollLeft < 4;
    $('#rvNext').disabled = track.scrollLeft + track.clientWidth > track.scrollWidth - 4;
  };
  track.addEventListener('scroll', syncNav, { passive: true });
  addEventListener('resize', syncNav);
  requestAnimationFrame(syncNav);

  // "leave a review" goes to the company's Telegram or WhatsApp when one is set
  const leave = $('#reviewLeave');
  const link = SITE.reviewLink || (SITE.telegram ? `https://t.me/${SITE.telegram}` : SITE.whatsapp ? `https://wa.me/${SITE.whatsapp}` : '');
  if (link) { leave.href = link; leave.hidden = false; }
  $('#reviews').hidden = false;
} else $('#reviews').remove();
