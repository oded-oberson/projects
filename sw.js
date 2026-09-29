/* OBERSON GO — service worker (v1)
   Shell files (this page, the boot sprite, icons, manifest) are cached on install and served cache-first.
   The application page itself is fetched by the loader from Supabase (site_blocks) — those requests are served
   network-first and the last good copy is kept per page range, so the app still opens when offline or when
   Supabase is briefly unreachable. Data requests (rest/v1 for other tables, auth, realtime, storage) are never cached. */
const VERSION = 'go-shell-v1';
const SHELL = ['./', './index.html', './manifest.webmanifest', './logo-draw.v4.webp', './logo.svg', './icon-192.png', './icon-512.png', './icon-512-maskable.png', './apple-touch-icon.png'];
const BLOCKS = 'go-blocks-v1';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL).catch(() => {})).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== BLOCKS).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });

const isBlocks = (url) => url.hostname.endsWith('.supabase.co') && url.pathname === '/rest/v1/site_blocks';
const isApp = (url) => url.origin === self.location.origin && /\/app\.html$/.test(url.pathname);
const isShell = (url) => url.origin === self.location.origin;
const isFont = (url) => /typekit\.net|oberson-arch\.com\/wp-content\/themes\/oberson\/fonts/.test(url.href);

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (isBlocks(url)) {
    // key the cached copy by URL + Range (the loader pages through the blocks with Range headers)
    const key = new Request(url.href + '#range=' + (req.headers.get('Range') || ''));
    e.respondWith(fetch(req).then((res) => {
      if (res.ok || res.status === 206) caches.open(BLOCKS).then((c) => c.put(key, res.clone())).catch(() => {});
      return res;
    }).catch(() => caches.match(key).then((hit) => hit || new Response('', { status: 503, statusText: 'offline' }))));
    return;
  }
  if (isApp(url)) {
    // the application page: network-first, last good copy kept (ignore the cache-busting query)
    const key = new Request(url.origin + url.pathname);
    e.respondWith(fetch(req).then((res) => { if (res.ok) caches.open(BLOCKS).then((c) => c.put(key, res.clone())).catch(() => {}); return res; })
      .catch(() => caches.match(key).then((hit) => hit || new Response('', { status: 503, statusText: 'offline' }))));
    return;
  }
  if (isShell(url)) {
    e.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => {
      const net = fetch(req).then((res) => { if (res.ok) caches.open(VERSION).then((c) => c.put(req, res.clone())).catch(() => {}); return res; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }
  if (isFont(url)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => { if (res.ok || res.type === 'opaque') caches.open(VERSION).then((c) => c.put(req, res.clone())).catch(() => {}); return res; })));
  }
});
