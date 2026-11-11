// Mude a versão sempre que quiser forçar a limpeza do cache antigo.
const CACHE = 'lepus-v10';
const SCOPE = self.registration.scope; // funciona em qualquer nome de repositório
const url = (p) => new URL(p, SCOPE).href;
const PRECACHE = ['./', 'index.html', 'styles.css', 'theme.js', 'icons.js', 'app.js', 'vendor/supabase.js', 'config.js', 'manifest.json',
  'fonts/sora-latin-wght-normal.woff2', 'fonts/inter-latin-wght-normal.woff2',
  'assets/logo.png', 'assets/logo-dark.png', 'assets/symbol-hero.png',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'].map(url);

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const res = await Promise.allSettled(PRECACHE.map((u) => cache.add(u)));
    res.forEach((r, i) => { if (r.status === 'rejected') console.warn('SW: falha ao cachear', PRECACHE[i], r.reason); });
  })());
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (u.origin !== self.location.origin) return; // Supabase, fontes, CDN: direto na rede, sem cache

  // Ícones e manifest: cache primeiro. Todo o resto (HTML/JS/config): rede primeiro, cache só offline.
  const estatico = /\/(icons|fonts|assets)\//.test(u.pathname) || /manifest\.json$/.test(u.pathname);
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (estatico) {
      const hit = await cache.match(req);
      if (hit) return hit;
    }
    try {
      const res = await fetch(req.mode === 'navigate' ? req.url : req, { cache: 'no-cache' });
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch (err) {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') return (await cache.match(url('index.html'))) || Response.error();
      return Response.error();
    }
  })());
});
