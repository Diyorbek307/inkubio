/*
 Anonymous visit statistics for the admin panel: one beacon per page view, plus "opened the order form"
 and the furthest chapter of the story reached. No cookies, no IP addresses, no personal data.
*/
(function () {
  if (navigator.webdriver || /[?&](prof|demo)\b/.test(location.search)) { window.inkTrack = function () {}; return; }
  var maxChapter = -1, opened = false;
  function post(o) {
    try {
      var b = JSON.stringify(o);
      if (navigator.sendBeacon && navigator.sendBeacon('/api/hit', new Blob([b], { type: 'application/json' }))) return;
      fetch('/api/hit', { method: 'POST', body: b, headers: { 'Content-Type': 'application/json' }, keepalive: true }).catch(function () {});
    } catch (e) { /* statistics are optional */ }
  }
  window.inkTrack = function (t, v) {
    if (t === 'chapter') { if (v <= maxChapter) return; maxChapter = v; }
    if (t === 'open') { if (opened) return; opened = true; }
    post({ t: t, v: v });
  };
  var day = new Date().toISOString().slice(0, 10), first = false;
  try { first = localStorage.getItem('ink-day') !== day; localStorage.setItem('ink-day', day); } catch (e) { first = true; }
  var ref = '';
  try { if (document.referrer) { var h = new URL(document.referrer).hostname; if (h !== location.hostname) ref = h; } } catch (e) { /* none */ }
  post({ t: 'view', first: first, lang: window.I18N ? window.I18N.lang : 'ru', ref: ref, w: window.innerWidth });
})();
