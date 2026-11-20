// Payback calculator for a batch of broiler chicks. Plain DOM, independent of the 3D story.
import { SITE } from './config.js';

const form = document.querySelector('#calcForm');
if (form) init();

function init() {
  const $ = (s) => document.querySelector(s);
  const fmt = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
  const fmt1 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
  const cur = SITE.currency ? ` ${SITE.currency}` : '';
  const C = SITE.calc || {};

  /*
   Practical farm figures (live weight kg, cumulative feed conversion) by age in days.
   Deliberately below the breed companies' targets, which assume ideal conditions.
   The owner can change them in js/config.js → calc.growth.
  */
  const GROWTH = C.growth || {
    'Ross 308': [[28, 1.45, 1.55], [35, 2.1, 1.65], [42, 2.65, 1.78], [49, 3.15, 1.92], [56, 3.55, 2.05]],
    'Cobb 500': [[28, 1.45, 1.53], [35, 2.1, 1.63], [42, 2.65, 1.76], [49, 3.15, 1.9], [56, 3.55, 2.03]],
    'Арбор Эйкерс': [[28, 1.4, 1.57], [35, 2.0, 1.68], [42, 2.55, 1.81], [49, 3.0, 1.95], [56, 3.4, 2.08]],
  };
  const CARCASS = C.carcassYield || 0.72; // carcass share of live weight
  const BAG = C.feedBag || 25; // kg in a feed bag

  function growth(breed, day) {
    const t = GROWTH[breed] || GROWTH['Ross 308'];
    if (day <= t[0][0]) return { w: t[0][1], fcr: t[0][2] };
    for (let i = 1; i < t.length; i++) {
      if (day <= t[i][0]) {
        const [d0, w0, f0] = t[i - 1];
        const [d1, w1, f1] = t[i];
        const k = (day - d0) / (d1 - d0);
        return { w: w0 + (w1 - w0) * k, fcr: f0 + (f1 - f0) * k };
      }
    }
    const l = t[t.length - 1];
    return { w: l[1], fcr: l[2] };
  }

  // the quantity slider is logarithmic: 10 … 50 000 birds, snapped to round numbers
  const QMIN = 10, QMAX = 50000;
  const toQty = (v) => {
    const q = QMIN * Math.pow(QMAX / QMIN, v / 100);
    const s = q < 100 ? 10 : q < 1000 ? 50 : q < 10000 ? 100 : 1000;
    return Math.round(q / s) * s;
  };
  const toSlider = (q) => Math.round((Math.log(Math.max(QMIN, Math.min(QMAX, q)) / QMIN) / Math.log(QMAX / QMIN)) * 100);

  // numbers typed with a comma, spaces or a currency sign still count
  const num = (v) => {
    const n = parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.').replace(/[^\d.]/g, ''));
    return Number.isFinite(n) ? n : null;
  };
  const days = (n) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'день' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'дня' : 'дней'}`;
  const heads = (n) => (n % 10 === 1 && n % 100 !== 11 ? 'цыплёнка' : 'цыплят');

  // remembered for this visitor only (their own prices), never sent anywhere
  const KEY = 'inkubio-calc';
  const FIELDS = ['breed', 'qtyN', 'days', 'chick', 'feed', 'sale', 'mode', 'surv', 'weight', 'fcr', 'other'];
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { /* private mode */ }
  const defaults = { feed: C.feedPrice, sale: C.salePrice };
  for (const f of FIELDS) {
    const v = saved[f] ?? defaults[f];
    if (v == null || v === '') continue;
    const el = form.elements[f];
    if (!el) continue;
    if (el instanceof RadioNodeList) { for (const r of el) r.checked = r.value === v; } else el.value = v;
  }
  if (!saved.chick && SITE.prices?.[form.breed.value] != null) form.chick.value = SITE.prices[form.breed.value];
  form.qty.value = toSlider(num(form.qtyN.value) || 500);
  $('#calcCur').textContent = SITE.currency ? `в ${SITE.currency}` : '';

  const signed = (v, f) => (v < 0 ? '−' : '') + f.format(Math.abs(v));
  const setW =(el, part) => (el.style.width = `${Math.max(0, part * 100).toFixed(2)}%`);

  function render() {
    const breed = form.breed.value;
    // an empty or unreadable count falls back to the slider position
    const qty = Math.max(1, Math.round(num(form.qtyN.value) || toQty(Number(form.qty.value))));
    const day = Number(form.days.value);
    const g = growth(breed, day);
    const surv = Math.min(100, Math.max(1, num(form.surv.value) ?? C.survival ?? 95)) / 100;
    const w = num(form.weight.value) || g.w;
    const fcr = num(form.fcr.value) || g.fcr;
    const carcass = form.mode.value === 'carcass';
    form.weight.placeholder = `авто: ${fmt1.format(g.w)}`;
    form.fcr.placeholder = `авто: ${fmt1.format(Math.round(g.fcr * 100) / 100)}`;
    $('#cDaysOut').textContent = days(day);

    const alive = Math.round(qty * surv);
    const live = alive * w; // kg live weight at the end
    // birds that drop out eat too: count them for about half the period
    const feed = live * fcr + (qty - alive) * w * 0.5 * fcr;
    const sold = carcass ? live * CARCASS : live;

    $('#cAlive').textContent = fmt.format(alive);
    $('#cWeight').textContent = fmt.format(sold);
    $('#cWeightLbl').textContent = carcass ? 'кг мяса тушкой' : 'кг живого веса';
    $('#cFeed').textContent = fmt.format(feed);
    $('#cFeedLbl').textContent = `кг корма · ≈ ${fmt.format(Math.ceil(feed / BAG))} меш. по ${BAG} кг`;

    const chick = num(form.chick.value);
    const feedP = num(form.feed.value);
    const sale = num(form.sale.value);
    const other = num(form.other.value) || 0;
    const big = $('#calcBig');
    const priced = chick != null && feedP != null;
    if (priced) {
      const cChick = qty * chick, cFeed = feed * feedP, cOther = qty * other;
      const cost = cChick + cFeed + cOther;
      const perKg = sold ? cost / sold : 0;
      $('#cPerKg').textContent = fmt.format(perKg) + cur;
      const rev = sale != null ? sold * sale : 0;
      const max = Math.max(cost, rev) || 1;
      setW($('#cbChick'), cChick / max);
      setW($('#cbFeed'), cFeed / max);
      setW($('#cbOther'), cOther / max);
      setW($('#cbRev'), rev / max);
      $('#cbCost').textContent = fmt.format(cost) + cur;
      $('#cbRevV').textContent = sale != null ? fmt.format(rev) + cur : '—';
      $('#calcBars').hidden = false;
      if (sale != null) {
        const profit = rev - cost;
        big.dataset.state = profit >= 0 ? 'plus' : 'minus';
        $('#calcBigLabel').textContent = profit >= 0 ? 'Прибыль с партии' : 'Убыток с партии';
        $('#calcProfit').textContent = (profit < 0 ? '−' : '') + fmt.format(Math.abs(profit)) + cur;
        const per = profit / qty;
        $('#calcProfitSub').textContent = `${signed(per, Math.abs(per) < 100 ? fmt1 : fmt)}${cur} с каждого цыплёнка · отдача ${signed((profit / cost) * 100, fmt)} % на вложения`;
      } else {
        big.dataset.state = 'cost';
        $('#calcBigLabel').textContent = 'Расходы на партию';
        $('#calcProfit').textContent = fmt.format(cost) + cur;
        $('#calcProfitSub').textContent = `Окупится при цене продажи от ${fmt.format(perKg)}${cur} за кг ${carcass ? 'тушки' : 'живого веса'}`;
      }
    } else {
      big.dataset.state = 'empty';
      $('#cPerKg').textContent = '—';
      $('#calcBars').hidden = true;
      $('#calcBigLabel').textContent = 'Прибыль с партии';
      $('#calcProfit').textContent = '—';
      $('#calcProfitSub').textContent = 'Впишите цену цыплёнка и корма — посчитаем расходы, а с ценой продажи и прибыль';
    }

    const btn = $('#calcOrder');
    btn.dataset.breed = breed;
    btn.dataset.qty = String(qty);
    btn.textContent = `Заказать ${fmt.format(qty)} ${heads(qty)} ${breed}`;

    try {
      const out = {};
      for (const f of FIELDS) out[f] = form.elements[f].value;
      localStorage.setItem(KEY, JSON.stringify(out));
    } catch { /* storage off */ }
  }

  form.addEventListener('input', (e) => {
    if (e.target === form.qty) form.qtyN.value = toQty(Number(form.qty.value));
    if (e.target === form.qtyN) form.qty.value = toSlider(num(form.qtyN.value) || QMIN);
    // the configured chick price follows the breed, unless the visitor typed their own
    if (e.target.name === 'breed' && !saved.chick && SITE.prices?.[form.breed.value] != null) form.chick.value = SITE.prices[form.breed.value];
    if (e.target === form.chick) saved.chick = form.chick.value;
    render();
  });
  form.addEventListener('change', render);
  render();
}
