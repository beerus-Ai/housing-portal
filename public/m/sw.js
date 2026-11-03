// Offline shell for the mobile app. API calls are never cached: data always comes live from the server.
const CACHE = 'sh-shell-v6';
const SHELL = ['/m/', '/m/m.js', '/common.js', '/api.js', '/css/ds.css', '/css/tokens.css', '/css/fonts.css', '/css/app.css', '/css/ui.css', '/css/mobile.css', '/ui.js', '/vendor/lottie/lottie_light.min.js', '/anim/loader.json', '/anim/check.json', '/anim/empty.json', '/anim/building.json', '/vendor/phosphor/style.css',
  '/vendor/phosphor/Phosphor-Duotone.woff2', '/vendor/fonts/outfit-latin-wght-normal.woff2', '/vendor/fonts/plus-jakarta-sans-latin-wght-normal.woff2', '/icon.svg', '/icons/icon-192.png', '/icons/icon-512.png'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return;
  // network first so updates show up; fall back to the cached shell when offline
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return r; }).catch(() => caches.match(e.request)));
});

