/// <reference lib="webworker" />
/**
 * KarmoLab Service Worker (TASK-KAR-115 → TASK-KL-088 재작성)
 *
 * 왜 고쳤나 — 이전 버전은 **모든 GET 을 cache-first** 로 응답했다. 그래서 새로 배포한
 * 위젯·스크립트가 이미 방문한 사용자에게 영영 안 보였고(캐시가 먼저 답하고 갱신은 다음 방문분),
 * 도구 상세 페이지가 옛 toolbox.js 를 만나 `#home` 으로 튀는 증상까지 낳았다.
 *
 * 전략:
 *  - HTML(내비게이션) · 앱 코드(js/css) = **network-first**, 실패 시에만 캐시 (오프라인 유지)
 *  - 폰트·이미지 등 나머지 = cache-first (바뀔 일이 드물고 무겁다)
 *  - 캐시 이름에 빌드 스탬프 → 새 SW 가 activate 하면서 옛 캐시를 통째로 버린다
 *  - install 에서 skipWaiting 하지 않는다. waiting 상태로 대기 → 앱이 사용자에게 물어보고
 *    (`pwa-update.ts`) 확인을 받으면 SKIP_WAITING 메시지로 교체한다.
 */

const ctx = self as unknown as ServiceWorkerGlobalScope;

/** build.mjs 가 빌드 시각으로 치환 (esbuild define) */
declare const __KARMOLAB_BUILD__: string;
const BUILD = typeof __KARMOLAB_BUILD__ === 'string' ? __KARMOLAB_BUILD__ : 'dev';
const CACHE_NAME = `karmolab-${BUILD}`;

const APP_SHELL = ['/karmolab/', '/apps/karmolab/manifest.json'];

/** 신선도가 중요한 것 — 앱 코드와 데이터 */
function isFreshCritical(url: URL, req: Request): boolean {
  if (req.mode === 'navigate') return true;
  if (url.origin !== ctx.location.origin) return false;
  return (
    url.pathname.startsWith('/apps/karmolab/js/') ||
    url.pathname.startsWith('/apps/karmolab/css/') ||
    url.pathname.startsWith('/apps/karmolab/data/') ||
    url.pathname.startsWith('/apps/karmolab/world/') ||
    url.pathname.endsWith('/manifest.json')
  );
}

ctx.addEventListener('install', (event: ExtendableEvent) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL).catch(() => undefined)));
  // skipWaiting 없음 — 사용자가 「지금 갱신」을 누를 때까지 기다린다.
});

ctx.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => ctx.clients.claim())
  );
});

ctx.addEventListener('message', (event: ExtendableMessageEvent) => {
  if (event.data === 'SKIP_WAITING') void ctx.skipWaiting();
  if (event.data === 'GET_BUILD') event.source?.postMessage({ type: 'BUILD', build: BUILD });
});

ctx.addEventListener('fetch', (event: FetchEvent) => {
  const req = event.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;

  let url: URL;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  if (!url.protocol.startsWith('http')) return;
  if (url.pathname.includes('/api/') || url.href.includes('tauri')) return;

  if (isFreshCritical(url, req)) {
    // network-first: 항상 최신을 먼저 시도하고, 끊겼을 때만 캐시로 버틴다.
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok && url.origin === ctx.location.origin) {
            const clone = res.clone();
            void caches.open(CACHE_NAME).then((c) => c.put(req, clone).catch(() => undefined));
          }
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || Response.error()))
    );
    return;
  }

  // 그 외(폰트·이미지 등) = cache-first + 백그라운드 갱신
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok && url.origin === ctx.location.origin) {
            const clone = res.clone();
            void caches.open(CACHE_NAME).then((c) => c.put(req, clone).catch(() => undefined));
          }
          return res;
        })
        .catch(() => cached || Response.error());
      return cached || network;
    })
  );
});
