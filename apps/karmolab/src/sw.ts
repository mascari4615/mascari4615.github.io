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

/**
 * 지문이 박힌 파일만 담는 곳간 — **배포가 바뀌어도 안 비운다** (TASK-KL-128 ②).
 *
 * 다른 곳간은 배포마다 통째로 버린다(옛 코드를 물지 않으려고). 그런데 지문이 박힌 것은
 * 주소가 곧 내용이라 옛것을 물 수가 없다 — 그래서 버릴 이유가 없다. 배포를 해도 **안 바뀐
 * 파일은 그대로 재사용**된다. 이게 다시 왔을 때 네트워크를 안 타는 대목이다.
 */
const IMMUTABLE_CACHE = 'karmolab-immutable';

const APP_SHELL = ['/karmolab/', '/apps/karmolab/manifest.json'];

/**
 * 설치할 때 미리 받아 두는 것 — **바뀔 일이 드물고 무거운 것만** (TASK-KL-128).
 *
 * 글꼴은 우리가 구워 둔 것이라 배포마다 바뀌지 않는다. 그런데 첫 화면에서는 일부러 늦게
 * 부르므로(화면 그리기와 회선을 다투지 않게), 두 번째 화면에서야 오는 경우가 많았다.
 * 설치가 끝난 뒤 한가할 때 받아 두면 그 기다림이 없어진다. 실패해도 그냥 넘어간다 —
 * 미리 받는 것이 안 됐다고 앱이 안 뜨면 안 된다.
 */
const PRECACHE_IDLE = [
  '/apps/karmolab/fonts/sans-latin.woff2',
  '/apps/karmolab/fonts/sans-ko.woff2',
  '/apps/karmolab/css/fonts.css'
];

/**
 * 이름에 **내용 지문**이 박힌 파일인가 (TASK-KL-128 ②, `scripts/stamp-assets.mjs`).
 *
 * 지문이 박혔다는 것은 **그 주소의 내용이 절대 안 바뀐다**는 뜻이다 — 내용이 바뀌면 주소가
 * 바뀌고, 새 화면은 새 주소를 부른다. 그러니 한 번 받은 것은 다시 물어볼 이유가 없다.
 * 이것이 「새 화면이 옛 코드를 만나던」 사고(아래 머리말)를 구조적으로 없애는 대목이다.
 */
function isImmutable(url: URL): boolean {
  if (url.origin !== ctx.location.origin) return false;
  return /\/apps\/karmolab\/(js|css)\/[^/]+\.[0-9a-f]{8}\.(js|css)$/.test(url.pathname);
}

/** 신선도가 중요한 것 — 앱 코드와 데이터 */
function isFreshCritical(url: URL, req: Request): boolean {
  if (req.mode === 'navigate') return true;
  if (url.origin !== ctx.location.origin) return false;
  if (isImmutable(url)) return false;   // 지문이 박힌 것은 물어볼 필요가 없다
  return (
    url.pathname.startsWith('/apps/karmolab/js/') ||
    url.pathname.startsWith('/apps/karmolab/css/') ||
    url.pathname.startsWith('/apps/karmolab/data/') ||
    url.pathname.startsWith('/apps/karmolab/world/') ||
    url.pathname.endsWith('/manifest.json')
  );
}

ctx.addEventListener('install', (event: ExtendableEvent) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await cache.addAll(APP_SHELL).catch(() => undefined);
      // 글꼴은 설치를 붙잡지 않는다 — 없어도 화면은 컴퓨터 글꼴로 멀쩡히 뜬다.
      void Promise.all(PRECACHE_IDLE.map((u) => cache.add(u).catch(() => undefined)));
    })
  );
  // skipWaiting 없음 — 사용자가 「지금 갱신」을 누를 때까지 기다린다.
});

ctx.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(
    (async () => {
      // 화면 이동을 이 워커가 가로채면, 워커가 깨어나는 동안 요청이 멈춰 있다. 「미리 보내기」를
      // 켜면 브라우저가 워커를 깨우는 것과 **동시에** 서버로 요청을 보낸다 (TASK-KL-128).
      // 우리는 화면 HTML 을 network-first 로 주므로, 그 기다림이 그대로 이동 시간이었다.
      if (ctx.registration.navigationPreload) {
        await ctx.registration.navigationPreload.enable().catch(() => undefined);
      }
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE_NAME && k !== IMMUTABLE_CACHE).map((k) => caches.delete(k))
      );
      await ctx.clients.claim();
    })()
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

  if (isImmutable(url)) {
    // 지문이 박힌 것 = 이 주소의 내용은 절대 안 바뀐다. 있으면 그냥 주고, 없을 때만 받아 온다.
    // 뒤에서 다시 확인하지도 않는다 — 확인할 것이 없다.
    event.respondWith(
      caches.open(IMMUTABLE_CACHE).then((c) =>
        c.match(req).then(
          (hit) =>
            hit ||
            fetch(req).then((res) => {
              if (res && res.ok) void c.put(req, res.clone()).catch(() => undefined);
              return res;
            })
        )
      )
    );
    return;
  }

  if (isFreshCritical(url, req)) {
    // network-first: 항상 최신을 먼저 시도하고, 끊겼을 때만 캐시로 버틴다.
    // 화면 이동이면 브라우저가 이미 보내 둔 응답(미리 보내기)을 먼저 쓴다 — 워커가 깨어나는
    // 동안 흘린 시간을 되찾는다. 안 켜졌거나 없으면 평소대로 우리가 받아 온다.
    const preloaded = req.mode === 'navigate' ? event.preloadResponse : undefined;
    event.respondWith(
      Promise.resolve(preloaded)
        .then((pre) => (pre as Response | undefined) || fetch(req))
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
