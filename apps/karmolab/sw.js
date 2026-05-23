// TASK-KAR-115 (Phase 3 native mobile substrate) — KarmoLab PWA Service Worker.
//
// 보수적 path: install/activate + offline app-shell cache. dynamic widget
// data (Tauri invoke, fetch) 는 network-first 으로 신선도 보장.
// 사용자 비전 영역 0 (UX 톤 변경 X, 기존 layout 위 install 가능성만 추가).

const CACHE_NAME = 'karmolab-shell-v1';
const APP_SHELL = [
  '/apps/karmolab/',
  '/apps/karmolab/index.html',
  '/apps/karmolab/manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL).catch(() => {})),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Tauri invoke / API / dynamic = network-first
  const url = req.url;
  if (url.includes('/api/') || url.includes('tauri') || req.method !== 'GET') {
    return; // browser default
  }
  // app shell = cache-first w/ background refresh
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req).then((res) => {
        if (res && res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, clone).catch(() => {}));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    }),
  );
});
